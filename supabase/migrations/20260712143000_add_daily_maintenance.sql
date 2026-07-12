-- Durable cleanup state for abandoned multipart uploads and owner-approved
-- media deletion jobs. All functions are service-role only.

alter table public.upload_reservations
  add column if not exists storage_cleaned_at timestamptz,
  add column if not exists storage_cleanup_attempts integer not null default 0
    check (storage_cleanup_attempts >= 0),
  add column if not exists storage_cleanup_error text;

create index if not exists upload_reservations_storage_cleanup_idx
  on public.upload_reservations(last_activity_at)
  where status in ('aborted', 'expired') and storage_cleaned_at is null;

alter table public.media_deletion_jobs
  add column if not exists last_attempt_at timestamptz;

create index if not exists media_deletion_jobs_claim_idx
  on public.media_deletion_jobs(status, last_attempt_at, created_at)
  where status <> 'completed';

create or replace function public.mark_upload_storage_cleanup_v1(
  p_reservation_id text,
  p_success boolean,
  p_error text default null,
  p_now timestamptz default now()
)
returns public.upload_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.upload_reservations;
begin
  select * into reservation
  from public.upload_reservations
  where id = p_reservation_id
  for update;

  if reservation.id is null
    or reservation.status not in ('aborted', 'expired') then
    raise exception 'Released upload reservation was not found.';
  end if;
  if reservation.storage_cleaned_at is not null then
    return reservation;
  end if;

  update public.upload_reservations
  set
    storage_cleanup_attempts = storage_cleanup_attempts + 1,
    storage_cleanup_error = case
      when p_success then null
      else left(coalesce(nullif(trim(p_error), ''), 'Storage cleanup failed.'), 1000)
    end,
    storage_cleaned_at = case when p_success then p_now else null end,
    last_activity_at = p_now
  where id = reservation.id
  returning * into reservation;
  return reservation;
end;
$$;

create or replace function public.claim_media_deletion_jobs_v1(
  p_limit integer default 50,
  p_now timestamptz default now()
)
returns setof public.media_deletion_jobs
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select job.id
    from public.media_deletion_jobs job
    where job.attempts < 10
      and (
        job.status in ('pending', 'failed')
        or (
          job.status = 'processing'
          and job.last_attempt_at < p_now - interval '15 minutes'
        )
      )
    order by job.created_at, job.id
    for update skip locked
    limit least(greatest(p_limit, 1), 200)
  )
  update public.media_deletion_jobs job
  set
    status = 'processing',
    attempts = job.attempts + 1,
    last_attempt_at = p_now,
    last_error = null
  from candidates
  where job.id = candidates.id
  returning job.*;
$$;

create or replace function public.finish_media_deletion_job_v1(
  p_job_id text,
  p_success boolean,
  p_error text default null,
  p_now timestamptz default now()
)
returns public.media_deletion_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.media_deletion_jobs;
begin
  select * into job
  from public.media_deletion_jobs
  where id = p_job_id
  for update;

  if job.id is null then
    raise exception 'Media deletion job was not found.';
  end if;
  if job.status = 'completed' then
    return job;
  end if;
  if job.status <> 'processing' then
    raise exception 'Media deletion job is not processing.';
  end if;

  update public.media_deletion_jobs
  set
    status = case when p_success then 'completed' else 'failed' end,
    last_error = case
      when p_success then null
      else left(coalesce(nullif(trim(p_error), ''), 'Storage deletion failed.'), 1000)
    end,
    processed_at = case when p_success then p_now else null end,
    last_attempt_at = p_now
  where id = job.id
  returning * into job;
  return job;
end;
$$;

revoke all on function public.mark_upload_storage_cleanup_v1(
  text, boolean, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.claim_media_deletion_jobs_v1(
  integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.finish_media_deletion_job_v1(
  text, boolean, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.mark_upload_storage_cleanup_v1(
  text, boolean, text, timestamptz
) to service_role;
grant execute on function public.claim_media_deletion_jobs_v1(
  integer, timestamptz
) to service_role;
grant execute on function public.finish_media_deletion_job_v1(
  text, boolean, text, timestamptz
) to service_role;
