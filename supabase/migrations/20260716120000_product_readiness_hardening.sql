-- Product-readiness hardening: explicit fresh-project grants, upload abuse
-- budgets, replay cleanup, privacy-safe cleanup finalization and retention.

grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.weddings,
  public.tokens,
  public.wedding_media,
  public.sessions,
  public.upgrade_logs
to service_role;

alter table public.weddings
  drop constraint if exists weddings_welcome_note_length_check;
alter table public.weddings
  add constraint weddings_welcome_note_length_check
  check (length(welcome_note) <= 2000) not valid;

alter table public.upload_reservations
  add column if not exists abuse_key_hash text
    check (abuse_key_hash is null or abuse_key_hash ~ '^[a-f0-9]{64}$');

create index if not exists upload_reservations_abuse_active_idx
  on public.upload_reservations(wedding_id, abuse_key_hash, expires_at)
  where status in ('pending', 'uploading');

drop index if exists public.upload_reservations_storage_cleanup_idx;
create index upload_reservations_storage_cleanup_idx
  on public.upload_reservations(last_activity_at)
  where status in ('completed', 'aborted', 'expired')
    and storage_cleaned_at is null;

create index if not exists media_deletion_jobs_wedding_idx
  on public.media_deletion_jobs(wedding_id);
create index if not exists owner_audit_logs_actor_session_idx
  on public.owner_audit_logs(actor_session_id)
  where actor_session_id is not null;

create or replace function public.reserve_guest_upload_v2(
  p_id text,
  p_client_request_key_hash text,
  p_secret_hash text,
  p_media_id text,
  p_wedding_id text,
  p_mode text,
  p_object_path text,
  p_staging_object_path text,
  p_kind text,
  p_mime_type text,
  p_file_name text,
  p_byte_size bigint,
  p_part_size_bytes bigint,
  p_part_count integer,
  p_thumbnail_path text default null,
  p_thumbnail_staging_path text default null,
  p_thumbnail_mime_type text default null,
  p_thumbnail_file_name text default null,
  p_thumbnail_byte_size bigint default null,
  p_guest_name text default null,
  p_note text default null,
  p_now timestamptz default now(),
  p_abuse_key_hash text default null
)
returns public.upload_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.upload_reservations;
  created public.upload_reservations;
  active_count integer;
  active_bytes bigint;
begin
  if p_abuse_key_hash is null or p_abuse_key_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Upload abuse key is invalid.';
  end if;

  select * into existing
  from public.upload_reservations
  where client_request_key_hash = p_client_request_key_hash;
  if found then
    return public.reserve_guest_upload_v1(
      p_id => p_id,
      p_client_request_key_hash => p_client_request_key_hash,
      p_secret_hash => p_secret_hash,
      p_media_id => p_media_id,
      p_wedding_id => p_wedding_id,
      p_mode => p_mode,
      p_object_path => p_object_path,
      p_staging_object_path => p_staging_object_path,
      p_kind => p_kind,
      p_mime_type => p_mime_type,
      p_file_name => p_file_name,
      p_byte_size => p_byte_size,
      p_part_size_bytes => p_part_size_bytes,
      p_part_count => p_part_count,
      p_thumbnail_path => p_thumbnail_path,
      p_thumbnail_staging_path => p_thumbnail_staging_path,
      p_thumbnail_mime_type => p_thumbnail_mime_type,
      p_thumbnail_file_name => p_thumbnail_file_name,
      p_thumbnail_byte_size => p_thumbnail_byte_size,
      p_guest_name => p_guest_name,
      p_note => p_note,
      p_now => p_now
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'upload-abuse:' || p_wedding_id || ':' || p_abuse_key_hash,
      0
    )
  );
  select count(*)::integer, coalesce(sum(byte_size), 0)::bigint
    into active_count, active_bytes
  from public.upload_reservations
  where wedding_id = p_wedding_id
    and abuse_key_hash = p_abuse_key_hash
    and status in ('pending', 'uploading')
    and expires_at > p_now;

  if active_count >= 3 or active_bytes + p_byte_size > 6442450944 then
    raise exception 'Upload rate limit exceeded.';
  end if;

  created := public.reserve_guest_upload_v1(
    p_id => p_id,
    p_client_request_key_hash => p_client_request_key_hash,
    p_secret_hash => p_secret_hash,
    p_media_id => p_media_id,
    p_wedding_id => p_wedding_id,
    p_mode => p_mode,
    p_object_path => p_object_path,
    p_staging_object_path => p_staging_object_path,
    p_kind => p_kind,
    p_mime_type => p_mime_type,
    p_file_name => p_file_name,
    p_byte_size => p_byte_size,
    p_part_size_bytes => p_part_size_bytes,
    p_part_count => p_part_count,
    p_thumbnail_path => p_thumbnail_path,
    p_thumbnail_staging_path => p_thumbnail_staging_path,
    p_thumbnail_mime_type => p_thumbnail_mime_type,
    p_thumbnail_file_name => p_thumbnail_file_name,
    p_thumbnail_byte_size => p_thumbnail_byte_size,
    p_guest_name => p_guest_name,
    p_note => p_note,
    p_now => p_now
  );
  update public.upload_reservations
  set abuse_key_hash = p_abuse_key_hash
  where id = created.id
  returning * into created;
  return created;
end;
$$;

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
    or reservation.status not in ('completed', 'aborted', 'expired') then
    raise exception 'Terminal upload reservation was not found.';
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
    join public.weddings wedding on wedding.id = job.wedding_id
    where job.storage_cleaned_at is null
      and (
        wedding.status = 'cleanup_pending'
        or (job.status = 'ready' and job.expires_at <= p_now)
        or (job.status = 'failed' and job.expires_at <= p_now)
        or (job.status in ('queued', 'running') and job.created_at <= p_now - interval '24 hours')
        or (
          job.status = 'expired'
          and (job.last_cleanup_attempt_at is null or job.last_cleanup_attempt_at < p_now - interval '15 minutes')
        )
      )
    order by job.expires_at nulls first, job.created_at
    for update of job skip locked
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
  select * into job from public.archive_jobs where id = p_job_id for update;
  if job.id is null or job.status <> 'expired' then
    raise exception 'Expired archive job was not found.';
  end if;
  if job.storage_cleaned_at is not null then return job; end if;
  if p_success then
    delete from public.archive_job_items where archive_job_id = job.id;
  end if;
  update public.archive_jobs
  set
    storage_cleaned_at = case when p_success then p_now else null end,
    storage_cleanup_error = case
      when p_success then null
      else left(coalesce(nullif(trim(p_error), ''), 'Archive storage cleanup failed.'), 1000)
    end,
    archive_path = case when p_success then null else archive_path end,
    archive_file_name = case when p_success then null else archive_file_name end,
    error_detail = case when p_success then null else error_detail end,
    updated_at = p_now
  where id = job.id
  returning * into job;
  return job;
end;
$$;

create or replace function public.owner_finalize_cleanup_v1(
  p_wedding_id text,
  p_now timestamptz default now()
)
returns public.weddings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.weddings;
  tombstone_slug text;
begin
  select * into target from public.weddings where id = p_wedding_id for update;
  if target.id is null or target.status <> 'cleanup_pending' then
    raise exception 'Wedding is not pending cleanup.';
  end if;
  if exists (
    select 1 from public.media_deletion_jobs
    where wedding_id = target.id and status <> 'completed'
  ) then raise exception 'Storage deletion jobs are not complete.'; end if;
  if exists (select 1 from public.wedding_media where wedding_id = target.id) then
    raise exception 'Wedding media still exists.';
  end if;
  if exists (
    select 1 from public.upload_reservations
    where wedding_id = target.id and storage_cleaned_at is null
  ) then raise exception 'Upload staging cleanup is not complete.'; end if;
  if exists (
    select 1 from public.archive_jobs
    where wedding_id = target.id and storage_cleaned_at is null
  ) then raise exception 'Archive cleanup is not complete.'; end if;

  update public.tokens set
    status = 'revoked',
    revoked_at = coalesce(revoked_at, p_now),
    activation_key_hash = null,
    activation_key_expires_at = null
  where wedding_id = target.id;
  update public.sessions set
    revoked_at = coalesce(revoked_at, p_now),
    expires_at = least(expires_at, p_now)
  where wedding_id = target.id;
  update public.entitlement_events
  set note = null, metadata = jsonb_build_object('redacted', true)
  where wedding_id = target.id;
  update public.owner_audit_logs
  set details = jsonb_build_object('redacted', true)
  where wedding_id = target.id;

  delete from public.upload_reservations where wedding_id = target.id;
  delete from public.media_deletion_jobs where wedding_id = target.id;
  delete from public.archive_jobs where wedding_id = target.id;
  delete from public.wedding_slugs where wedding_id = target.id;
  tombstone_slug := 'deleted-' || encode(extensions.gen_random_bytes(10), 'hex');

  update public.weddings
  set
    slug = tombstone_slug,
    studio_code = 'DEL-' || upper(encode(extensions.gen_random_bytes(6), 'hex')),
    bride_name = 'Silinmiş',
    groom_name = 'Hesap',
    couple_name = 'Silinmiş hesap',
    event_date = null,
    timezone = 'UTC',
    password_hash = null,
    password_version = password_version + 1,
    password_changed_at = p_now,
    welcome_note = '',
    upload_locked = true,
    status = 'anonymized',
    anonymized_at = p_now,
    updated_at = p_now
  where id = target.id
  returning * into target;

  insert into public.owner_audit_logs (
    id, action, wedding_id, details, created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    'wedding.cleanup_finalized',
    target.id,
    jsonb_build_object('tombstone_slug', tombstone_slug),
    p_now
  );
  return target;
end;
$$;

create or replace function public.prune_operational_metadata_v1(
  p_now timestamptz default now(),
  p_limit integer default 500
)
returns table (
  upload_reservations_deleted integer,
  deletion_jobs_deleted integer,
  rate_limit_buckets_deleted integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bounded_limit integer := least(greatest(p_limit, 1), 2000);
begin
  with candidates as (
    select id from public.upload_reservations
    where status in ('completed', 'aborted', 'expired')
      and storage_cleaned_at is not null
      and last_activity_at < p_now - interval '30 days'
    order by last_activity_at
    limit bounded_limit
  ), deleted as (
    delete from public.upload_reservations reservation
    using candidates where reservation.id = candidates.id returning 1
  ) select count(*)::integer into upload_reservations_deleted from deleted;

  with candidates as (
    select id from public.media_deletion_jobs
    where status = 'completed' and processed_at < p_now - interval '30 days'
    order by processed_at
    limit bounded_limit
  ), deleted as (
    delete from public.media_deletion_jobs job
    using candidates where job.id = candidates.id returning 1
  ) select count(*)::integer into deletion_jobs_deleted from deleted;

  with candidates as (
    select key_hash, action from public.rate_limit_buckets
    where updated_at < p_now - interval '7 days'
    order by updated_at
    limit bounded_limit
  ), deleted as (
    delete from public.rate_limit_buckets bucket
    using candidates
    where bucket.key_hash = candidates.key_hash and bucket.action = candidates.action
    returning 1
  ) select count(*)::integer into rate_limit_buckets_deleted from deleted;
  return next;
end;
$$;

revoke all on function public.reserve_guest_upload_v2(
  text, text, text, text, text, text, text, text, text, text, text,
  bigint, bigint, integer, text, text, text, text, bigint, text, text,
  timestamptz, text
) from public, anon, authenticated;
grant execute on function public.reserve_guest_upload_v2(
  text, text, text, text, text, text, text, text, text, text, text,
  bigint, bigint, integer, text, text, text, text, bigint, text, text,
  timestamptz, text
) to service_role;
revoke all on function public.prune_operational_metadata_v1(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.prune_operational_metadata_v1(timestamptz, integer)
  to service_role;
