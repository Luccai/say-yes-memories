-- Atomic guest quota reservations, resumable multipart state and single-use
-- completion. R2 object existence is verified by the server before completion.

alter table public.upload_reservations
  add column if not exists client_request_key_hash text,
  add column if not exists staging_object_path text,
  add column if not exists thumbnail_staging_path text,
  add column if not exists part_size_bytes bigint,
  add column if not exists part_count integer,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists thumbnail_completed_at timestamptz;

alter table public.upload_reservations
  add constraint upload_reservations_client_request_hash_check
    check (
      client_request_key_hash is null
      or client_request_key_hash ~ '^[a-f0-9]{64}$'
    ) not valid,
  add constraint upload_reservations_secret_hash_check
    check (secret_hash ~ '^[a-f0-9]{64}$') not valid,
  add constraint upload_reservations_part_plan_check
    check (
      part_size_bytes is null
      or (
        part_size_bytes > 0
        and part_count between 1 and 10000
      )
    ) not valid;

alter table public.upload_reservations
  validate constraint upload_reservations_client_request_hash_check;
alter table public.upload_reservations
  validate constraint upload_reservations_secret_hash_check;
alter table public.upload_reservations
  validate constraint upload_reservations_part_plan_check;

create unique index if not exists upload_reservations_client_request_key
  on public.upload_reservations(client_request_key_hash)
  where client_request_key_hash is not null;
create unique index if not exists upload_reservations_staging_object_key
  on public.upload_reservations(staging_object_path)
  where staging_object_path is not null;
create unique index if not exists upload_reservations_thumbnail_staging_key
  on public.upload_reservations(thumbnail_staging_path)
  where thumbnail_staging_path is not null;

create or replace function public.reserve_guest_upload_v1(
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
  p_now timestamptz default now()
)
returns public.upload_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  wedding public.weddings;
  existing public.upload_reservations;
  created public.upload_reservations;
  expected_part_count integer;
  thumbnail_supplied boolean;
begin
  if p_id !~ '^upload_[a-f0-9]{24}$'
    or p_media_id !~ '^asset_[a-f0-9]{24}$'
    or p_client_request_key_hash !~ '^[a-f0-9]{64}$'
    or p_secret_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Upload reservation identity is invalid.';
  end if;
  if p_kind not in ('image', 'video', 'audio')
    or length(trim(coalesce(p_mime_type, ''))) = 0
    or length(trim(coalesce(p_file_name, ''))) not between 1 and 255
    or p_byte_size <= 0
    or p_byte_size > 5368709120 then
    raise exception 'Upload file metadata is invalid.';
  end if;
  if length(trim(coalesce(p_guest_name, ''))) not between 1 and 120
    or length(coalesce(p_note, '')) > 2000 then
    raise exception 'Guest upload details are invalid.';
  end if;

  expected_part_count := case
    when p_byte_size <= 104857600 then 1
    else ((p_byte_size + 67108864 - 1) / 67108864)::integer
  end;
  if (p_byte_size <= 104857600 and (
      p_mode <> 'single'
      or p_part_count <> 1
      or p_part_size_bytes <> p_byte_size
    ))
    or (p_byte_size > 104857600 and (
      p_mode <> 'multipart'
      or p_part_count <> expected_part_count
      or p_part_size_bytes <> 67108864
    )) then
    raise exception 'Upload part plan is invalid.';
  end if;

  if left(
      p_object_path,
      length('weddings/' || p_wedding_id || '/guest/' || p_media_id || '-')
    ) <> 'weddings/' || p_wedding_id || '/guest/' || p_media_id || '-'
    or left(
      p_staging_object_path,
      length('weddings/' || p_wedding_id || '/upload-staging/' || p_id || '-')
    ) <> 'weddings/' || p_wedding_id || '/upload-staging/' || p_id || '-' then
    raise exception 'Upload object path is invalid.';
  end if;

  thumbnail_supplied := p_thumbnail_path is not null
    or p_thumbnail_staging_path is not null
    or p_thumbnail_mime_type is not null
    or p_thumbnail_file_name is not null
    or p_thumbnail_byte_size is not null;
  if thumbnail_supplied and (
    p_thumbnail_path is null
    or p_thumbnail_staging_path is null
    or p_thumbnail_mime_type is null
    or p_thumbnail_file_name is null
    or p_thumbnail_byte_size is null
    or p_thumbnail_byte_size <= 0
    or p_thumbnail_byte_size > 1048576
    or left(
      p_thumbnail_path,
      length(
        'weddings/' || p_wedding_id || '/guest-thumbnail/' || p_media_id || '-thumb-'
      )
    ) <> 'weddings/' || p_wedding_id || '/guest-thumbnail/' || p_media_id || '-thumb-'
    or left(
      p_thumbnail_staging_path,
      length(
        'weddings/' || p_wedding_id || '/upload-staging/' || p_id || '-thumb-'
      )
    ) <> 'weddings/' || p_wedding_id || '/upload-staging/' || p_id || '-thumb-'
  ) then
    raise exception 'Upload thumbnail metadata is invalid.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'upload-request:' || p_client_request_key_hash,
      0
    )
  );

  select * into existing
  from public.upload_reservations
  where client_request_key_hash = p_client_request_key_hash
  for update;
  if found then
    if existing.secret_hash <> p_secret_hash
      or existing.wedding_id <> p_wedding_id
      or existing.media_id <> p_media_id
      or existing.mode <> p_mode
      or existing.object_path <> p_object_path
      or existing.staging_object_path <> p_staging_object_path
      or existing.kind <> p_kind
      or existing.byte_size <> p_byte_size
      or existing.mime_type <> p_mime_type
      or existing.file_name <> p_file_name
      or existing.part_size_bytes <> p_part_size_bytes
      or existing.part_count <> p_part_count
      or existing.thumbnail_path is distinct from p_thumbnail_path
      or existing.thumbnail_staging_path is distinct from p_thumbnail_staging_path
      or existing.thumbnail_mime_type is distinct from p_thumbnail_mime_type
      or existing.thumbnail_file_name is distinct from p_thumbnail_file_name
      or existing.thumbnail_byte_size is distinct from p_thumbnail_byte_size
      or existing.guest_name <> trim(p_guest_name)
      or existing.note is distinct from nullif(trim(coalesce(p_note, '')), '') then
      raise exception 'Upload request key was reused with different metadata.';
    end if;
    return existing;
  end if;

  select * into wedding
  from public.weddings
  where id = p_wedding_id
  for update;
  if not found
    or wedding.status <> 'active'
    or wedding.upload_locked
    or wedding.uploads_open_at is null
    or wedding.uploads_open_at > p_now
    or wedding.access_expires_at is null
    or wedding.access_expires_at < p_now then
    raise exception 'Guest uploads are unavailable.';
  end if;
  if wedding.storage_used_bytes
      + wedding.reserved_storage_bytes
      + p_byte_size
      > wedding.storage_quota_bytes then
    raise exception 'Storage quota exceeded.';
  end if;

  insert into public.upload_reservations (
    id,
    wedding_id,
    client_request_key_hash,
    secret_hash,
    media_id,
    mode,
    status,
    object_path,
    staging_object_path,
    thumbnail_path,
    thumbnail_staging_path,
    kind,
    mime_type,
    file_name,
    byte_size,
    part_size_bytes,
    part_count,
    thumbnail_mime_type,
    thumbnail_file_name,
    thumbnail_byte_size,
    guest_name,
    note,
    expires_at,
    last_activity_at,
    created_at
  ) values (
    p_id,
    p_wedding_id,
    p_client_request_key_hash,
    p_secret_hash,
    p_media_id,
    p_mode,
    'pending',
    p_object_path,
    p_staging_object_path,
    p_thumbnail_path,
    p_thumbnail_staging_path,
    p_kind,
    p_mime_type,
    p_file_name,
    p_byte_size,
    p_part_size_bytes,
    p_part_count,
    p_thumbnail_mime_type,
    p_thumbnail_file_name,
    p_thumbnail_byte_size,
    trim(p_guest_name),
    nullif(trim(coalesce(p_note, '')), ''),
    p_now + interval '24 hours',
    p_now,
    p_now
  ) returning * into created;

  update public.weddings
  set
    reserved_storage_bytes = reserved_storage_bytes + p_byte_size,
    updated_at = p_now
  where id = wedding.id;

  return created;
end;
$$;

create or replace function public.attach_multipart_upload_v1(
  p_reservation_id text,
  p_secret_hash text,
  p_r2_upload_id text,
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

  if not found
    or reservation.secret_hash <> p_secret_hash
    or reservation.mode <> 'multipart'
    or reservation.status not in ('pending', 'uploading')
    or reservation.expires_at <= p_now
    or length(trim(coalesce(p_r2_upload_id, ''))) = 0
    or length(p_r2_upload_id) > 1024 then
    raise exception 'Multipart reservation is unavailable.';
  end if;
  if reservation.r2_upload_id is not null
    and reservation.r2_upload_id <> p_r2_upload_id then
    raise exception 'Multipart upload is already attached.';
  end if;

  update public.upload_reservations
  set
    r2_upload_id = p_r2_upload_id,
    status = 'uploading',
    last_activity_at = p_now
  where id = reservation.id
  returning * into reservation;
  return reservation;
end;
$$;

create or replace function public.record_upload_part_v1(
  p_reservation_id text,
  p_secret_hash text,
  p_part_number integer,
  p_etag text,
  p_byte_size bigint,
  p_now timestamptz default now()
)
returns public.upload_parts
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.upload_reservations;
  expected_byte_size bigint;
  stored_part public.upload_parts;
begin
  select * into reservation
  from public.upload_reservations
  where id = p_reservation_id
  for update;

  if not found
    or reservation.secret_hash <> p_secret_hash
    or reservation.mode <> 'multipart'
    or reservation.r2_upload_id is null
    or reservation.status <> 'uploading'
    or reservation.expires_at <= p_now
    or p_part_number < 1
    or p_part_number > reservation.part_count
    or length(trim(coalesce(p_etag, ''))) not between 1 and 256 then
    raise exception 'Upload part is unavailable.';
  end if;

  expected_byte_size := case
    when p_part_number = reservation.part_count then
      reservation.byte_size
        - reservation.part_size_bytes * (reservation.part_count - 1)
    else reservation.part_size_bytes
  end;
  if p_byte_size <> expected_byte_size then
    raise exception 'Upload part size is invalid.';
  end if;

  insert into public.upload_parts (
    reservation_id,
    part_number,
    etag,
    byte_size,
    uploaded_at
  ) values (
    reservation.id,
    p_part_number,
    trim(p_etag),
    p_byte_size,
    p_now
  )
  on conflict (reservation_id, part_number) do update
  set
    etag = excluded.etag,
    byte_size = excluded.byte_size,
    uploaded_at = excluded.uploaded_at
  returning * into stored_part;

  update public.upload_reservations
  set last_activity_at = p_now
  where id = reservation.id;
  return stored_part;
end;
$$;

create or replace function public.abort_upload_reservation_v1(
  p_reservation_id text,
  p_secret_hash text,
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
  if not found or reservation.secret_hash <> p_secret_hash then
    raise exception 'Upload reservation was not found.';
  end if;
  if reservation.status = 'completed' then
    raise exception 'Completed uploads cannot be cancelled.';
  end if;
  if reservation.status in ('aborted', 'expired') then
    return reservation;
  end if;

  update public.weddings
  set
    reserved_storage_bytes = greatest(
      reserved_storage_bytes - reservation.byte_size,
      0
    ),
    updated_at = p_now
  where id = reservation.wedding_id;

  update public.upload_reservations
  set
    status = 'aborted',
    aborted_at = p_now,
    last_activity_at = p_now
  where id = reservation.id
  returning * into reservation;
  return reservation;
end;
$$;

create or replace function public.expire_upload_reservation_v1(
  p_reservation_id text,
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
  if not found then
    raise exception 'Upload reservation was not found.';
  end if;
  if reservation.status in ('completed', 'aborted', 'expired') then
    return reservation;
  end if;
  if reservation.expires_at > p_now then
    raise exception 'Upload reservation has not expired.';
  end if;

  update public.weddings
  set
    reserved_storage_bytes = greatest(
      reserved_storage_bytes - reservation.byte_size,
      0
    ),
    updated_at = p_now
  where id = reservation.wedding_id;

  update public.upload_reservations
  set
    status = 'expired',
    aborted_at = p_now,
    last_activity_at = p_now
  where id = reservation.id
  returning * into reservation;
  return reservation;
end;
$$;

create or replace function public.complete_upload_reservation_v1(
  p_reservation_id text,
  p_secret_hash text,
  p_thumbnail_completed boolean default false,
  p_now timestamptz default now()
)
returns public.wedding_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.upload_reservations;
  media public.wedding_media;
  part_total bigint;
  part_rows integer;
begin
  select * into reservation
  from public.upload_reservations
  where id = p_reservation_id
  for update;

  if not found or reservation.secret_hash <> p_secret_hash then
    raise exception 'Upload reservation was not found.';
  end if;
  if reservation.status = 'completed' then
    select * into media
    from public.wedding_media
    where upload_reservation_id = reservation.id;
    if not found then
      raise exception 'Completed upload media is missing.';
    end if;
    return media;
  end if;
  if reservation.status not in ('pending', 'uploading')
    or reservation.expires_at <= p_now then
    raise exception 'Upload reservation is unavailable.';
  end if;
  if p_thumbnail_completed and reservation.thumbnail_path is null then
    raise exception 'Upload thumbnail was not reserved.';
  end if;

  if reservation.mode = 'multipart' then
    select count(*)::integer, coalesce(sum(byte_size), 0)::bigint
    into part_rows, part_total
    from public.upload_parts
    where reservation_id = reservation.id;
    if part_rows <> reservation.part_count
      or part_total <> reservation.byte_size then
      raise exception 'Multipart upload is incomplete.';
    end if;
  end if;

  update public.weddings
  set
    storage_used_bytes = storage_used_bytes + reservation.byte_size,
    reserved_storage_bytes = greatest(
      reserved_storage_bytes - reservation.byte_size,
      0
    ),
    updated_at = p_now
  where id = reservation.wedding_id
    and status = 'active';
  if not found then
    raise exception 'Wedding membership is unavailable.';
  end if;

  insert into public.wedding_media (
    id,
    wedding_id,
    upload_reservation_id,
    storage_path,
    kind,
    mime_type,
    file_name,
    byte_size,
    thumbnail_id,
    thumbnail_path,
    thumbnail_mime_type,
    thumbnail_file_name,
    thumbnail_byte_size,
    thumbnail_created_at,
    guest_name,
    note,
    approved,
    hidden,
    favorite,
    created_at,
    updated_at
  ) values (
    reservation.media_id,
    reservation.wedding_id,
    reservation.id,
    reservation.object_path,
    reservation.kind,
    reservation.mime_type,
    reservation.file_name,
    reservation.byte_size,
    case when p_thumbnail_completed then reservation.media_id || '_thumb' end,
    case when p_thumbnail_completed then reservation.thumbnail_path end,
    case when p_thumbnail_completed then reservation.thumbnail_mime_type end,
    case when p_thumbnail_completed then reservation.thumbnail_file_name end,
    case when p_thumbnail_completed then reservation.thumbnail_byte_size end,
    case when p_thumbnail_completed then p_now end,
    reservation.guest_name,
    reservation.note,
    true,
    false,
    false,
    p_now,
    p_now
  ) returning * into media;

  update public.upload_reservations
  set
    status = 'completed',
    completed_at = p_now,
    thumbnail_completed_at = case
      when p_thumbnail_completed then p_now
      else null
    end,
    last_activity_at = p_now
  where id = reservation.id;

  return media;
end;
$$;

create or replace function app_private.track_thumbnail_system_storage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.weddings
    set system_storage_bytes = system_storage_bytes
      + coalesce(new.thumbnail_byte_size, 0)
    where id = new.wedding_id;
    return new;
  end if;

  update public.weddings
  set system_storage_bytes = greatest(
    system_storage_bytes - coalesce(old.thumbnail_byte_size, 0),
    0
  )
  where id = old.wedding_id;
  return old;
end;
$$;

create or replace function app_private.track_profile_system_storage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.system_storage_bytes = greatest(
    coalesce(new.system_storage_bytes, 0)
      - case when tg_op = 'UPDATE' then coalesce(old.profile_media_byte_size, 0) else 0 end
      + coalesce(new.profile_media_byte_size, 0),
    0
  );
  return new;
end;
$$;

drop trigger if exists track_profile_system_storage
  on public.weddings;
create trigger track_profile_system_storage
before insert or update of profile_media_byte_size on public.weddings
for each row execute function app_private.track_profile_system_storage();

drop trigger if exists track_thumbnail_system_storage_insert
  on public.wedding_media;
create trigger track_thumbnail_system_storage_insert
after insert on public.wedding_media
for each row execute function app_private.track_thumbnail_system_storage();

drop trigger if exists track_thumbnail_system_storage_delete
  on public.wedding_media;
create trigger track_thumbnail_system_storage_delete
after delete on public.wedding_media
for each row execute function app_private.track_thumbnail_system_storage();

update public.weddings wedding
set system_storage_bytes = coalesce(wedding.profile_media_byte_size, 0)
  + coalesce((
    select sum(media.thumbnail_byte_size)
    from public.wedding_media media
    where media.wedding_id = wedding.id
  ), 0);

revoke all on function public.reserve_guest_upload_v1(
  text, text, text, text, text, text, text, text, text, text, text,
  bigint, bigint, integer, text, text, text, text, bigint, text, text,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.attach_multipart_upload_v1(
  text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.record_upload_part_v1(
  text, text, integer, text, bigint, timestamptz
) from public, anon, authenticated;
revoke all on function public.abort_upload_reservation_v1(
  text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.expire_upload_reservation_v1(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_upload_reservation_v1(
  text, text, boolean, timestamptz
) from public, anon, authenticated;
revoke all on function app_private.track_thumbnail_system_storage()
  from public, anon, authenticated;
revoke all on function app_private.track_profile_system_storage()
  from public, anon, authenticated;

grant execute on function public.reserve_guest_upload_v1(
  text, text, text, text, text, text, text, text, text, text, text,
  bigint, bigint, integer, text, text, text, text, bigint, text, text,
  timestamptz
) to service_role;
grant execute on function public.attach_multipart_upload_v1(
  text, text, text, timestamptz
) to service_role;
grant execute on function public.record_upload_part_v1(
  text, text, integer, text, bigint, timestamptz
) to service_role;
grant execute on function public.abort_upload_reservation_v1(
  text, text, timestamptz
) to service_role;
grant execute on function public.expire_upload_reservation_v1(text, timestamptz)
  to service_role;
grant execute on function public.complete_upload_reservation_v1(
  text, text, boolean, timestamptz
) to service_role;
