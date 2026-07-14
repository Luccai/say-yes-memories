-- Private, temporary ZIP archives. Archive output is system storage and never
-- changes a couple's purchased media quota.

create table if not exists public.archive_jobs (
  id text primary key,
  wedding_id text not null references public.weddings(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed', 'expired')),
  active boolean not null default true,
  source_media_count integer not null default 0 check (source_media_count >= 0),
  source_photo_count integer not null default 0 check (source_photo_count >= 0),
  source_video_count integer not null default 0 check (source_video_count >= 0),
  source_audio_count integer not null default 0 check (source_audio_count >= 0),
  source_total_bytes bigint not null default 0 check (source_total_bytes >= 0),
  prepared_media_count integer not null default 0 check (prepared_media_count >= 0),
  prepared_source_bytes bigint not null default 0 check (prepared_source_bytes >= 0),
  archive_path text unique,
  archive_file_name text,
  archive_byte_size bigint check (archive_byte_size is null or archive_byte_size >= 0),
  error_code text,
  error_detail text,
  worker_started_at timestamptz,
  attempt_id text,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  storage_cleaned_at timestamptz,
  storage_cleanup_attempts integer not null default 0 check (storage_cleanup_attempts >= 0),
  storage_cleanup_error text,
  last_cleanup_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'ready' and archive_path is not null and archive_file_name is not null and completed_at is not null and expires_at is not null)
    or status <> 'ready'
  )
);

create unique index if not exists archive_jobs_one_active_wedding_idx
  on public.archive_jobs(wedding_id)
  where active;

create index if not exists archive_jobs_expiry_cleanup_idx
  on public.archive_jobs(status, expires_at, last_cleanup_attempt_at)
  where status in ('ready', 'failed', 'expired') and storage_cleaned_at is null;

create table if not exists public.archive_job_items (
  archive_job_id text not null references public.archive_jobs(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  media_id text not null,
  kind text not null check (kind in ('image', 'video', 'audio')),
  storage_path text not null,
  file_name text not null,
  byte_size bigint not null check (byte_size > 0),
  guest_name text not null,
  note text,
  created_at timestamptz not null,
  primary key (archive_job_id, ordinal),
  unique (archive_job_id, media_id)
);

create index if not exists archive_job_items_job_idx
  on public.archive_job_items(archive_job_id, ordinal);

alter table public.archive_jobs enable row level security;
alter table public.archive_job_items enable row level security;

revoke all on public.archive_jobs from public, anon, authenticated;
revoke all on public.archive_job_items from public, anon, authenticated;
grant select, insert, update, delete on public.archive_jobs to service_role;
grant select, insert, update, delete on public.archive_job_items to service_role;

create or replace function public.create_archive_job_v1(
  p_job_id text,
  p_wedding_id text,
  p_now timestamptz default now()
)
returns public.archive_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_job public.archive_jobs;
  created_job public.archive_jobs;
begin
  if length(trim(p_job_id)) < 8 then
    raise exception 'Archive job id is invalid.';
  end if;

  perform 1
  from public.weddings
  where id = p_wedding_id
  for update;
  if not found then
    raise exception 'Wedding was not found.';
  end if;

  select * into existing_job
  from public.archive_jobs
  where wedding_id = p_wedding_id
    and active
  order by created_at desc
  limit 1
  for update;

  if existing_job.id is not null
    and existing_job.status = 'ready'
    and existing_job.expires_at <= p_now then
    update public.archive_jobs
    set
      status = 'expired',
      active = false,
      updated_at = p_now
    where id = existing_job.id;
  elsif existing_job.id is not null then
    return existing_job;
  end if;

  insert into public.archive_jobs (
    id,
    wedding_id,
    status,
    active,
    archive_path,
    archive_file_name,
    created_at,
    updated_at
  ) values (
    p_job_id,
    p_wedding_id,
    'queued',
    true,
    null,
    (select slug || '-wedding-memories.zip' from public.weddings where id = p_wedding_id),
    p_now,
    p_now
  ) returning * into created_job;

  insert into public.archive_job_items (
    archive_job_id,
    ordinal,
    media_id,
    kind,
    storage_path,
    file_name,
    byte_size,
    guest_name,
    note,
    created_at
  )
  select
    created_job.id,
    row_number() over (order by media.created_at, media.id)::integer,
    media.id,
    media.kind,
    media.storage_path,
    media.file_name,
    media.byte_size,
    media.guest_name,
    media.note,
    media.created_at
  from public.wedding_media media
  where media.wedding_id = p_wedding_id
  order by media.created_at, media.id;

  update public.archive_jobs job
  set
    source_media_count = (
      select count(*)::integer
      from public.archive_job_items item
      where item.archive_job_id = created_job.id
    ),
    source_photo_count = (
      select count(*)::integer
      from public.archive_job_items item
      where item.archive_job_id = created_job.id and item.kind = 'image'
    ),
    source_video_count = (
      select count(*)::integer
      from public.archive_job_items item
      where item.archive_job_id = created_job.id and item.kind = 'video'
    ),
    source_audio_count = (
      select count(*)::integer
      from public.archive_job_items item
      where item.archive_job_id = created_job.id and item.kind = 'audio'
    ),
    source_total_bytes = (
      select coalesce(sum(item.byte_size), 0)::bigint
      from public.archive_job_items item
      where item.archive_job_id = created_job.id
    ),
    updated_at = p_now
  where job.id = created_job.id
  returning * into created_job;

  if created_job.source_media_count = 0 then
    raise exception 'There are no memories to archive yet.';
  end if;

  return created_job;
end;
$$;

create or replace function public.claim_archive_job_attempt_v1(
  p_job_id text,
  p_attempt_id text,
  p_now timestamptz default now()
)
returns public.archive_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.archive_jobs;
begin
  select * into job
  from public.archive_jobs
  where id = p_job_id
  for update;
  if job.id is null then
    raise exception 'Archive job was not found.';
  end if;
  if p_attempt_id !~ '^attempt_[a-f0-9]{24}$' then
    raise exception 'Archive attempt id is invalid.';
  end if;
  if job.status = 'running' and job.lease_expires_at > p_now then
    if job.attempt_id = p_attempt_id then
      update public.archive_jobs
      set lease_expires_at = p_now + interval '2 hours', updated_at = p_now
      where id = job.id
      returning * into job;
    end if;
    return job;
  end if;
  if not job.active
    or (job.status <> 'queued' and not (job.status = 'running' and job.lease_expires_at <= p_now)) then
    raise exception 'Archive job cannot be claimed.';
  end if;

  update public.archive_jobs
  set
    status = 'running',
    attempt_id = p_attempt_id,
    lease_expires_at = p_now + interval '2 hours',
    worker_started_at = p_now,
    updated_at = p_now
  where id = job.id
  returning * into job;
  return job;
end;
$$;

create or replace function public.get_archive_source_summary_v1(
  p_wedding_id text
)
returns table (
  media_count integer,
  photo_count integer,
  video_count integer,
  audio_count integer,
  total_bytes bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    count(*)::integer as media_count,
    count(*) filter (where kind = 'image')::integer as photo_count,
    count(*) filter (where kind = 'video')::integer as video_count,
    count(*) filter (where kind = 'audio')::integer as audio_count,
    coalesce(sum(byte_size), 0)::bigint as total_bytes
  from public.wedding_media
  where wedding_id = p_wedding_id;
$$;

create or replace function public.update_archive_job_progress_v1(
  p_job_id text,
  p_attempt_id text,
  p_prepared_media_count integer,
  p_prepared_source_bytes bigint,
  p_now timestamptz default now()
)
returns public.archive_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.archive_jobs;
begin
  select * into job
  from public.archive_jobs
  where id = p_job_id
  for update;
  if job.id is null then
    raise exception 'Archive job was not found.';
  end if;
  if job.status <> 'running' or job.attempt_id <> p_attempt_id then
    raise exception 'Archive attempt is stale.';
  end if;

  update public.archive_jobs
  set
    prepared_media_count = least(
      source_media_count,
      greatest(prepared_media_count, greatest(p_prepared_media_count, 0))
    ),
    prepared_source_bytes = least(
      source_total_bytes,
      greatest(prepared_source_bytes, greatest(p_prepared_source_bytes, 0))
    ),
    lease_expires_at = p_now + interval '2 hours',
    updated_at = p_now
  where id = job.id
  returning * into job;
  return job;
end;
$$;

create or replace function public.complete_archive_job_v1(
  p_job_id text,
  p_attempt_id text,
  p_archive_path text,
  p_archive_file_name text,
  p_archive_byte_size bigint,
  p_now timestamptz default now()
)
returns public.archive_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.archive_jobs;
begin
  select * into job
  from public.archive_jobs
  where id = p_job_id
  for update;
  if job.id is null then
    raise exception 'Archive job was not found.';
  end if;
  if job.status = 'ready'
    and job.attempt_id = p_attempt_id
    and job.archive_path = p_archive_path
    and job.archive_file_name = p_archive_file_name
    and job.archive_byte_size = p_archive_byte_size then
    return job;
  end if;
  if job.status <> 'running' or not job.active or job.attempt_id <> p_attempt_id then
    raise exception 'Archive job is not running.';
  end if;
  if length(trim(p_archive_path)) = 0
    or length(trim(p_archive_file_name)) = 0
    or p_archive_byte_size <= 0 then
    raise exception 'Archive output is invalid.';
  end if;
  if job.archive_file_name is not null
    and job.archive_file_name <> p_archive_file_name then
    raise exception 'Archive output filename is invalid.';
  end if;
  if job.archive_path is not null and job.archive_path <> p_archive_path then
    raise exception 'Archive output path is invalid.';
  end if;

  update public.archive_jobs
  set
    status = 'ready',
    prepared_media_count = source_media_count,
    prepared_source_bytes = source_total_bytes,
    archive_path = p_archive_path,
    archive_file_name = p_archive_file_name,
    archive_byte_size = p_archive_byte_size,
    completed_at = p_now,
    expires_at = p_now + interval '24 hours',
    lease_expires_at = null,
    error_code = null,
    error_detail = null,
    updated_at = p_now
  where id = job.id
  returning * into job;
  return job;
end;
$$;

create or replace function public.fail_archive_job_v1(
  p_job_id text,
  p_attempt_id text,
  p_error_code text,
  p_error_detail text default null,
  p_now timestamptz default now()
)
returns public.archive_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.archive_jobs;
begin
  select * into job
  from public.archive_jobs
  where id = p_job_id
  for update;
  if job.id is null then
    raise exception 'Archive job was not found.';
  end if;
  if job.status in ('ready', 'expired') then
    raise exception 'Archive job is already final.';
  end if;
  if p_attempt_id is not null and job.attempt_id <> p_attempt_id then
    raise exception 'Archive attempt is stale.';
  end if;
  if p_attempt_id is null and job.status <> 'queued' then
    raise exception 'Only a queued archive can fail without an attempt.';
  end if;

  update public.archive_jobs
  set
    status = 'failed',
    active = false,
    expires_at = coalesce(job.expires_at, p_now + interval '24 hours'),
    error_code = left(coalesce(nullif(trim(p_error_code), ''), 'ARCHIVE_FAILED'), 80),
    error_detail = left(coalesce(nullif(trim(p_error_detail), ''), 'Archive preparation failed.'), 1000),
    lease_expires_at = null,
    updated_at = p_now
  where id = job.id
  returning * into job;
  return job;
end;
$$;

create or replace function public.claim_expired_archive_jobs_v1(
  p_limit integer default 25,
  p_now timestamptz default now()
)
returns setof public.archive_jobs
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select job.id
    from public.archive_jobs job
    where job.storage_cleaned_at is null
      and (
        (job.status = 'ready' and job.expires_at <= p_now)
        or (job.status = 'failed' and job.expires_at <= p_now)
        or (
          job.status in ('queued', 'running')
          and job.created_at <= p_now - interval '24 hours'
        )
        or (
          job.status = 'expired'
          and (
            job.last_cleanup_attempt_at is null
            or job.last_cleanup_attempt_at < p_now - interval '15 minutes'
          )
        )
      )
    order by job.expires_at nulls first, job.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  update public.archive_jobs job
  set
    status = 'expired',
    active = false,
    storage_cleanup_attempts = job.storage_cleanup_attempts + 1,
    last_cleanup_attempt_at = p_now,
    updated_at = p_now
  from candidates
  where job.id = candidates.id
  returning job.*;
$$;

create or replace function public.mark_archive_storage_cleanup_v1(
  p_job_id text,
  p_success boolean,
  p_error text default null,
  p_now timestamptz default now()
)
returns public.archive_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.archive_jobs;
begin
  select * into job
  from public.archive_jobs
  where id = p_job_id
  for update;
  if job.id is null or job.status <> 'expired' then
    raise exception 'Expired archive job was not found.';
  end if;
  if job.storage_cleaned_at is not null then
    return job;
  end if;

  update public.archive_jobs
  set
    storage_cleaned_at = case when p_success then p_now else null end,
    storage_cleanup_error = case
      when p_success then null
      else left(coalesce(nullif(trim(p_error), ''), 'Archive storage cleanup failed.'), 1000)
    end,
    updated_at = p_now
  where id = job.id
  returning * into job;
  return job;
end;
$$;

revoke all on function public.create_archive_job_v1(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_archive_job_attempt_v1(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_archive_source_summary_v1(text)
  from public, anon, authenticated;
revoke all on function public.update_archive_job_progress_v1(text, text, integer, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_archive_job_v1(text, text, text, text, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.fail_archive_job_v1(text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_expired_archive_jobs_v1(integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.mark_archive_storage_cleanup_v1(text, boolean, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.create_archive_job_v1(text, text, timestamptz)
  to service_role;
grant execute on function public.claim_archive_job_attempt_v1(text, text, timestamptz)
  to service_role;
grant execute on function public.get_archive_source_summary_v1(text)
  to service_role;
grant execute on function public.update_archive_job_progress_v1(text, text, integer, bigint, timestamptz)
  to service_role;
grant execute on function public.complete_archive_job_v1(text, text, text, text, bigint, timestamptz)
  to service_role;
grant execute on function public.fail_archive_job_v1(text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.claim_expired_archive_jobs_v1(integer, timestamptz)
  to service_role;
grant execute on function public.mark_archive_storage_cleanup_v1(text, boolean, text, timestamptz)
  to service_role;
