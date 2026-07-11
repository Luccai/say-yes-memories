-- Secure owner identity, rolling device sessions, token lifecycle and
-- approval-gated account cleanup. All write functions are service-role only.

alter table public.owner_sessions
  add column if not exists user_agent_hash text check (
    user_agent_hash is null or user_agent_hash ~ '^[a-f0-9]{64}$'
  ),
  add column if not exists ip_hash text check (
    ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'
  );

alter table public.owner_audit_logs
  add column if not exists operation_key text check (
    operation_key is null or length(operation_key) between 8 and 160
  );

create unique index if not exists owner_audit_logs_operation_key
  on public.owner_audit_logs(operation_key)
  where operation_key is not null;

alter table public.tokens
  add column if not exists label text check (
    label is null or length(trim(label)) between 1 and 80
  ),
  add column if not exists created_by_owner_session_id text
    references public.owner_sessions(id) on delete set null;

create index if not exists tokens_created_by_owner_session_idx
  on public.tokens(created_by_owner_session_id)
  where created_by_owner_session_id is not null;

create index if not exists weddings_cleanup_candidates_idx
  on public.weddings(cleanup_after)
  where status = 'active' and cleanup_after is not null;

create index if not exists weddings_couple_name_lower_idx
  on public.weddings(lower(couple_name));

create or replace function app_private.require_owner_session_v1(
  p_session_id text,
  p_now timestamptz default now()
)
returns public.owner_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.owner_sessions;
  credentials public.owner_credentials;
begin
  select * into target_session
  from public.owner_sessions
  where id = p_session_id
  for update;

  select * into credentials
  from public.owner_credentials
  where id = 'primary'
  for update;

  if target_session.id is null
    or credentials.id is null
    or target_session.revoked_at is not null
    or target_session.expires_at <= p_now
    or target_session.password_version <> credentials.password_version then
    raise exception 'Owner session is unavailable.';
  end if;

  return target_session;
end;
$$;

create or replace function public.owner_setup_v1(
  p_password_hash text,
  p_session_id text,
  p_session_token_hash text,
  p_device_label text,
  p_user_agent_hash text,
  p_ip_hash text,
  p_now timestamptz default now()
)
returns public.owner_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_session public.owner_sessions;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('owner-one-time-setup', 0)
  );

  if exists (select 1 from public.owner_credentials where id = 'primary') then
    raise exception 'Owner setup was already completed.';
  end if;
  if length(coalesce(p_password_hash, '')) < 20
    or p_session_token_hash !~ '^[a-f0-9]{64}$'
    or p_user_agent_hash !~ '^[a-f0-9]{64}$'
    or p_ip_hash !~ '^[a-f0-9]{64}$'
    or length(trim(coalesce(p_device_label, ''))) not between 2 and 80 then
    raise exception 'Owner setup input is invalid.';
  end if;

  insert into public.owner_credentials (
    id,
    password_hash,
    password_version,
    setup_completed_at,
    password_changed_at,
    created_at,
    updated_at
  ) values (
    'primary',
    p_password_hash,
    1,
    p_now,
    p_now,
    p_now,
    p_now
  );

  insert into public.owner_sessions (
    id,
    token_hash,
    password_version,
    device_label,
    user_agent_hash,
    ip_hash,
    created_at,
    last_seen_at,
    expires_at,
    revoked_at
  ) values (
    p_session_id,
    p_session_token_hash,
    1,
    trim(p_device_label),
    p_user_agent_hash,
    p_ip_hash,
    p_now,
    p_now,
    p_now + interval '90 days',
    null
  ) returning * into created_session;

  insert into public.owner_audit_logs (
    id,
    actor_session_id,
    action,
    operation_key,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    created_session.id,
    'owner.setup_completed',
    'owner-setup-primary',
    jsonb_build_object('device_label', created_session.device_label),
    p_now
  );

  return created_session;
end;
$$;

create or replace function public.owner_create_session_v1(
  p_session_id text,
  p_session_token_hash text,
  p_password_version integer,
  p_device_label text,
  p_user_agent_hash text,
  p_ip_hash text,
  p_now timestamptz default now()
)
returns public.owner_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  credentials public.owner_credentials;
  created_session public.owner_sessions;
begin
  select * into credentials
  from public.owner_credentials
  where id = 'primary'
  for update;

  if credentials.id is null
    or credentials.password_version <> p_password_version then
    raise exception 'Owner credentials changed.';
  end if;
  if p_session_token_hash !~ '^[a-f0-9]{64}$'
    or p_user_agent_hash !~ '^[a-f0-9]{64}$'
    or p_ip_hash !~ '^[a-f0-9]{64}$'
    or length(trim(coalesce(p_device_label, ''))) not between 2 and 80 then
    raise exception 'Owner session input is invalid.';
  end if;

  insert into public.owner_sessions (
    id,
    token_hash,
    password_version,
    device_label,
    user_agent_hash,
    ip_hash,
    created_at,
    last_seen_at,
    expires_at,
    revoked_at
  ) values (
    p_session_id,
    p_session_token_hash,
    credentials.password_version,
    trim(p_device_label),
    p_user_agent_hash,
    p_ip_hash,
    p_now,
    p_now,
    p_now + interval '90 days',
    null
  ) returning * into created_session;

  insert into public.owner_audit_logs (
    id,
    actor_session_id,
    action,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    created_session.id,
    'owner.signed_in',
    jsonb_build_object('device_label', created_session.device_label),
    p_now
  );

  return created_session;
end;
$$;

create or replace function public.owner_touch_session_v1(
  p_session_token_hash text,
  p_now timestamptz default now()
)
returns public.owner_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.owner_sessions;
  credentials public.owner_credentials;
begin
  if p_session_token_hash !~ '^[a-f0-9]{64}$' then
    return null;
  end if;

  select * into target_session
  from public.owner_sessions
  where token_hash = p_session_token_hash
  for update;

  select * into credentials
  from public.owner_credentials
  where id = 'primary';

  if target_session.id is null
    or credentials.id is null
    or target_session.revoked_at is not null
    or target_session.expires_at <= p_now
    or target_session.password_version <> credentials.password_version then
    return null;
  end if;

  update public.owner_sessions
  set
    last_seen_at = p_now,
    expires_at = p_now + interval '90 days'
  where id = target_session.id
  returning * into target_session;

  return target_session;
end;
$$;

create or replace function public.owner_logout_v1(
  p_session_token_hash text,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.owner_sessions;
begin
  update public.owner_sessions
  set
    revoked_at = coalesce(revoked_at, p_now),
    expires_at = least(expires_at, p_now)
  where token_hash = p_session_token_hash
  returning * into target_session;

  if target_session.id is not null then
    insert into public.owner_audit_logs (
      id,
      actor_session_id,
      action,
      details,
      created_at
    ) values (
      'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
      target_session.id,
      'owner.signed_out',
      '{}'::jsonb,
      p_now
    );
  end if;
end;
$$;

create or replace function public.owner_revoke_session_v1(
  p_actor_session_id text,
  p_target_session_id text,
  p_operation_key text,
  p_now timestamptz default now()
)
returns public.owner_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_session public.owner_sessions;
  target_session public.owner_sessions;
  existing_audit public.owner_audit_logs;
  normalized_operation_key text;
begin
  normalized_operation_key := lower(trim(coalesce(p_operation_key, '')));
  if length(normalized_operation_key) not between 8 and 160 then
    raise exception 'Operation key is invalid.';
  end if;

  actor_session := app_private.require_owner_session_v1(p_actor_session_id, p_now);

  select * into existing_audit
  from public.owner_audit_logs
  where operation_key = normalized_operation_key;
  if found then
    if existing_audit.action <> 'owner.session_revoked' then
      raise exception 'Operation key was already used.';
    end if;
    select * into target_session
    from public.owner_sessions
    where id = p_target_session_id;
    return target_session;
  end if;

  update public.owner_sessions
  set
    revoked_at = coalesce(revoked_at, p_now),
    expires_at = least(expires_at, p_now)
  where id = p_target_session_id
  returning * into target_session;

  if target_session.id is null then
    raise exception 'Owner device session was not found.';
  end if;

  insert into public.owner_audit_logs (
    id,
    actor_session_id,
    action,
    operation_key,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    actor_session.id,
    'owner.session_revoked',
    normalized_operation_key,
    jsonb_build_object('target_session_id', target_session.id),
    p_now
  );

  return target_session;
end;
$$;

create or replace function public.owner_change_password_v1(
  p_actor_session_id text,
  p_expected_password_version integer,
  p_password_hash text,
  p_new_session_id text,
  p_new_session_token_hash text,
  p_device_label text,
  p_user_agent_hash text,
  p_ip_hash text,
  p_operation_key text,
  p_now timestamptz default now()
)
returns public.owner_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_session public.owner_sessions;
  credentials public.owner_credentials;
  created_session public.owner_sessions;
  normalized_operation_key text;
begin
  normalized_operation_key := lower(trim(coalesce(p_operation_key, '')));
  if length(normalized_operation_key) not between 8 and 160
    or length(coalesce(p_password_hash, '')) < 20
    or p_new_session_token_hash !~ '^[a-f0-9]{64}$'
    or p_user_agent_hash !~ '^[a-f0-9]{64}$'
    or p_ip_hash !~ '^[a-f0-9]{64}$'
    or length(trim(coalesce(p_device_label, ''))) not between 2 and 80 then
    raise exception 'Owner password change input is invalid.';
  end if;

  actor_session := app_private.require_owner_session_v1(p_actor_session_id, p_now);
  select * into credentials
  from public.owner_credentials
  where id = 'primary'
  for update;

  if credentials.password_version <> p_expected_password_version
    or actor_session.password_version <> credentials.password_version then
    raise exception 'Owner credentials changed.';
  end if;

  update public.owner_credentials
  set
    password_hash = p_password_hash,
    password_version = password_version + 1,
    password_changed_at = p_now,
    updated_at = p_now
  where id = 'primary'
  returning * into credentials;

  update public.owner_sessions
  set
    revoked_at = coalesce(revoked_at, p_now),
    expires_at = least(expires_at, p_now)
  where revoked_at is null;

  insert into public.owner_sessions (
    id,
    token_hash,
    password_version,
    device_label,
    user_agent_hash,
    ip_hash,
    created_at,
    last_seen_at,
    expires_at,
    revoked_at
  ) values (
    p_new_session_id,
    p_new_session_token_hash,
    credentials.password_version,
    trim(p_device_label),
    p_user_agent_hash,
    p_ip_hash,
    p_now,
    p_now,
    p_now + interval '90 days',
    null
  ) returning * into created_session;

  insert into public.owner_audit_logs (
    id,
    actor_session_id,
    action,
    operation_key,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    actor_session.id,
    'owner.password_changed',
    normalized_operation_key,
    jsonb_build_object('new_password_version', credentials.password_version),
    p_now
  );

  return created_session;
end;
$$;

create or replace function public.owner_issue_token_v1(
  p_actor_session_id text,
  p_token_id text,
  p_token_hash text,
  p_label text,
  p_operation_key text,
  p_now timestamptz default now()
)
returns public.tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_session public.owner_sessions;
  created_token public.tokens;
  existing_audit public.owner_audit_logs;
  normalized_operation_key text;
begin
  normalized_operation_key := lower(trim(coalesce(p_operation_key, '')));
  if length(normalized_operation_key) not between 8 and 160
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or length(trim(coalesce(p_label, ''))) not between 1 and 80 then
    raise exception 'Token issue input is invalid.';
  end if;

  actor_session := app_private.require_owner_session_v1(p_actor_session_id, p_now);
  select * into existing_audit
  from public.owner_audit_logs
  where operation_key = normalized_operation_key;
  if found then
    if existing_audit.action <> 'token.issued' then
      raise exception 'Operation key was already used.';
    end if;
    select * into created_token
    from public.tokens
    where id = existing_audit.details ->> 'token_id';
    return created_token;
  end if;

  insert into public.tokens (
    id,
    token_hash,
    status,
    wedding_id,
    label,
    created_by_owner_session_id,
    created_at,
    activated_at,
    revoked_at
  ) values (
    p_token_id,
    p_token_hash,
    'unused',
    null,
    trim(p_label),
    actor_session.id,
    p_now,
    null,
    null
  ) returning * into created_token;

  insert into public.owner_audit_logs (
    id,
    actor_session_id,
    action,
    operation_key,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    actor_session.id,
    'token.issued',
    normalized_operation_key,
    jsonb_build_object('token_id', created_token.id, 'label', created_token.label),
    p_now
  );

  return created_token;
end;
$$;

create or replace function public.owner_rotate_token_v1(
  p_actor_session_id text,
  p_old_token_id text,
  p_new_token_id text,
  p_new_token_hash text,
  p_label text,
  p_operation_key text,
  p_now timestamptz default now()
)
returns public.tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_session public.owner_sessions;
  old_token public.tokens;
  created_token public.tokens;
  existing_audit public.owner_audit_logs;
  normalized_operation_key text;
begin
  normalized_operation_key := lower(trim(coalesce(p_operation_key, '')));
  if length(normalized_operation_key) not between 8 and 160
    or p_new_token_hash !~ '^[a-f0-9]{64}$'
    or length(trim(coalesce(p_label, ''))) not between 1 and 80 then
    raise exception 'Token rotation input is invalid.';
  end if;

  actor_session := app_private.require_owner_session_v1(p_actor_session_id, p_now);
  select * into existing_audit
  from public.owner_audit_logs
  where operation_key = normalized_operation_key;
  if found then
    if existing_audit.action <> 'token.rotated' then
      raise exception 'Operation key was already used.';
    end if;
    select * into created_token
    from public.tokens
    where id = existing_audit.details ->> 'new_token_id';
    return created_token;
  end if;

  select * into old_token
  from public.tokens
  where id = p_old_token_id
  for update;

  if old_token.id is null or old_token.status = 'revoked' then
    raise exception 'Token is unavailable for rotation.';
  end if;

  update public.tokens
  set
    status = 'revoked',
    revoked_at = p_now,
    activation_key_hash = null,
    activation_key_expires_at = null
  where id = old_token.id;

  insert into public.tokens (
    id,
    token_hash,
    status,
    wedding_id,
    label,
    created_by_owner_session_id,
    created_at,
    activated_at,
    revoked_at,
    rotated_from_id
  ) values (
    p_new_token_id,
    p_new_token_hash,
    old_token.status,
    old_token.wedding_id,
    trim(p_label),
    actor_session.id,
    p_now,
    case when old_token.status = 'active' then p_now else null end,
    null,
    old_token.id
  ) returning * into created_token;

  insert into public.owner_audit_logs (
    id,
    actor_session_id,
    action,
    wedding_id,
    operation_key,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    actor_session.id,
    'token.rotated',
    old_token.wedding_id,
    normalized_operation_key,
    jsonb_build_object(
      'old_token_id', old_token.id,
      'new_token_id', created_token.id,
      'label', created_token.label
    ),
    p_now
  );

  return created_token;
end;
$$;

create or replace function public.owner_revoke_token_v1(
  p_actor_session_id text,
  p_token_id text,
  p_reason text,
  p_operation_key text,
  p_now timestamptz default now()
)
returns public.tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_session public.owner_sessions;
  target_token public.tokens;
  existing_audit public.owner_audit_logs;
  normalized_operation_key text;
begin
  normalized_operation_key := lower(trim(coalesce(p_operation_key, '')));
  if length(normalized_operation_key) not between 8 and 160
    or length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Token revocation input is invalid.';
  end if;

  actor_session := app_private.require_owner_session_v1(p_actor_session_id, p_now);
  select * into existing_audit
  from public.owner_audit_logs
  where operation_key = normalized_operation_key;
  if found then
    if existing_audit.action <> 'token.revoked' then
      raise exception 'Operation key was already used.';
    end if;
    select * into target_token from public.tokens where id = p_token_id;
    return target_token;
  end if;

  update public.tokens
  set
    status = 'revoked',
    revoked_at = coalesce(revoked_at, p_now),
    activation_key_hash = null,
    activation_key_expires_at = null
  where id = p_token_id
  returning * into target_token;

  if target_token.id is null then
    raise exception 'Token was not found.';
  end if;

  insert into public.owner_audit_logs (
    id,
    actor_session_id,
    action,
    wedding_id,
    operation_key,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    actor_session.id,
    'token.revoked',
    target_token.wedding_id,
    normalized_operation_key,
    jsonb_build_object('token_id', target_token.id, 'reason', trim(p_reason)),
    p_now
  );

  return target_token;
end;
$$;

create or replace function public.owner_approve_cleanup_v1(
  p_actor_session_id text,
  p_wedding_id text,
  p_operation_key text,
  p_now timestamptz default now()
)
returns table (
  result_wedding_id text,
  jobs_queued integer,
  bytes_queued bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_session public.owner_sessions;
  target public.weddings;
  existing_audit public.owner_audit_logs;
  normalized_operation_key text;
  queued_count integer := 0;
  queued_bytes bigint := 0;
begin
  normalized_operation_key := lower(trim(coalesce(p_operation_key, '')));
  if length(normalized_operation_key) not between 8 and 160 then
    raise exception 'Cleanup operation key is invalid.';
  end if;

  actor_session := app_private.require_owner_session_v1(p_actor_session_id, p_now);
  select * into existing_audit
  from public.owner_audit_logs
  where operation_key = normalized_operation_key;
  if found then
    if existing_audit.action <> 'wedding.cleanup_approved'
      or existing_audit.wedding_id is distinct from p_wedding_id then
      raise exception 'Operation key was already used.';
    end if;
    return query select
      p_wedding_id,
      coalesce((existing_audit.details ->> 'jobs_queued')::integer, 0),
      coalesce((existing_audit.details ->> 'bytes_queued')::bigint, 0);
    return;
  end if;

  select * into target
  from public.weddings
  where id = p_wedding_id
  for update;

  if target.id is null
    or target.status <> 'active'
    or target.cleanup_after is null
    or target.cleanup_after > p_now then
    raise exception 'Wedding is not eligible for cleanup.';
  end if;

  select
    count(*)::integer,
    coalesce(sum(byte_size), 0)::bigint
  into queued_count, queued_bytes
  from public.wedding_media
  where wedding_id = target.id;

  queued_count := queued_count + case when target.profile_media_path is null then 0 else 1 end;
  queued_bytes := queued_bytes + coalesce(target.profile_media_byte_size, 0);

  insert into public.media_deletion_jobs (
    id,
    wedding_id,
    media_id,
    object_path,
    thumbnail_path,
    status,
    attempts,
    created_at
  )
  select
    'del_' || encode(extensions.gen_random_bytes(12), 'hex'),
    media.wedding_id,
    media.id,
    media.storage_path,
    media.thumbnail_path,
    'pending',
    0,
    p_now
  from public.wedding_media media
  where media.wedding_id = target.id
  on conflict (media_id) do nothing;

  if target.profile_media_path is not null then
    insert into public.media_deletion_jobs (
      id,
      wedding_id,
      media_id,
      object_path,
      thumbnail_path,
      status,
      attempts,
      created_at
    ) values (
      'del_' || encode(extensions.gen_random_bytes(12), 'hex'),
      target.id,
      coalesce(target.profile_media_id, 'profile_' || target.id),
      target.profile_media_path,
      null,
      'pending',
      0,
      p_now
    ) on conflict (media_id) do nothing;
  end if;

  delete from public.wedding_media where wedding_id = target.id;

  update public.upload_reservations
  set status = 'aborted'
  where wedding_id = target.id
    and status in ('pending', 'uploading');

  update public.sessions
  set
    revoked_at = coalesce(revoked_at, p_now),
    expires_at = least(expires_at, p_now)
  where wedding_id = target.id
    and revoked_at is null;

  update public.weddings
  set
    status = 'cleanup_pending',
    upload_locked = true,
    storage_used_bytes = 0,
    reserved_storage_bytes = 0,
    system_storage_bytes = 0,
    profile_media_id = null,
    profile_media_path = null,
    profile_media_kind = null,
    profile_media_mime_type = null,
    profile_media_file_name = null,
    profile_media_byte_size = null,
    profile_media_created_at = null,
    updated_at = p_now
  where id = target.id;

  insert into public.owner_audit_logs (
    id,
    actor_session_id,
    action,
    wedding_id,
    operation_key,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    actor_session.id,
    'wedding.cleanup_approved',
    target.id,
    normalized_operation_key,
    jsonb_build_object(
      'jobs_queued', queued_count,
      'bytes_queued', queued_bytes
    ),
    p_now
  );

  return query select target.id, queued_count, queued_bytes;
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
  select * into target
  from public.weddings
  where id = p_wedding_id
  for update;

  if target.id is null or target.status <> 'cleanup_pending' then
    raise exception 'Wedding is not pending cleanup.';
  end if;
  if exists (
    select 1
    from public.media_deletion_jobs
    where wedding_id = target.id
      and status <> 'completed'
  ) then
    raise exception 'Storage deletion jobs are not complete.';
  end if;
  if exists (
    select 1 from public.wedding_media where wedding_id = target.id
  ) then
    raise exception 'Wedding media still exists.';
  end if;

  update public.tokens
  set
    status = 'revoked',
    revoked_at = coalesce(revoked_at, p_now),
    activation_key_hash = null,
    activation_key_expires_at = null
  where wedding_id = target.id;

  update public.sessions
  set
    revoked_at = coalesce(revoked_at, p_now),
    expires_at = least(expires_at, p_now)
  where wedding_id = target.id;

  delete from public.wedding_slugs where wedding_id = target.id;
  tombstone_slug := 'deleted-' || encode(extensions.gen_random_bytes(10), 'hex');

  update public.weddings
  set
    slug = tombstone_slug,
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
    id,
    action,
    wedding_id,
    details,
    created_at
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

create or replace function public.owner_overview_v1(
  p_now timestamptz default now()
)
returns table (
  total_memberships bigint,
  active_memberships bigint,
  upcoming_weddings bigint,
  expired_memberships bigint,
  cleanup_candidates bigint,
  guest_storage_bytes bigint,
  system_storage_bytes bigint,
  reserved_storage_bytes bigint,
  media_count bigint,
  unused_tokens bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::bigint,
    count(*) filter (
      where wedding.status = 'active'
        and wedding.access_expires_at >= p_now
    )::bigint,
    count(*) filter (
      where wedding.status = 'active'
        and wedding.event_date is not null
        and wedding.event_date >= (p_now at time zone wedding.timezone)::date
    )::bigint,
    count(*) filter (
      where wedding.status = 'active'
        and wedding.access_expires_at < p_now
    )::bigint,
    count(*) filter (
      where wedding.status = 'active'
        and wedding.cleanup_after <= p_now
    )::bigint,
    coalesce(sum(wedding.storage_used_bytes), 0)::bigint,
    coalesce(sum(wedding.system_storage_bytes), 0)::bigint,
    coalesce(sum(wedding.reserved_storage_bytes), 0)::bigint,
    (select count(*) from public.wedding_media)::bigint,
    (select count(*) from public.tokens where status = 'unused')::bigint
  from public.weddings wedding
  where wedding.status <> 'anonymized';
$$;

create or replace function public.owner_list_weddings_v1(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id text,
  slug text,
  couple_name text,
  event_date date,
  timezone text,
  plan text,
  status text,
  storage_quota_bytes bigint,
  storage_used_bytes bigint,
  reserved_storage_bytes bigint,
  system_storage_bytes bigint,
  access_expires_at timestamptz,
  cleanup_after timestamptz,
  uploads_open_at timestamptz,
  upload_locked boolean,
  has_profile boolean,
  media_count bigint,
  created_at timestamptz,
  activated_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select
      wedding.id,
      wedding.slug,
      wedding.couple_name,
      wedding.event_date,
      wedding.timezone,
      wedding.plan,
      wedding.status,
      wedding.storage_quota_bytes,
      wedding.storage_used_bytes,
      wedding.reserved_storage_bytes,
      wedding.system_storage_bytes,
      wedding.access_expires_at,
      wedding.cleanup_after,
      wedding.uploads_open_at,
      wedding.upload_locked,
      wedding.profile_media_path is not null as has_profile,
      count(media.id)::bigint as media_count,
      wedding.created_at,
      wedding.activated_at,
      wedding.updated_at
    from public.weddings wedding
    left join public.wedding_media media on media.wedding_id = wedding.id
    where wedding.status <> 'anonymized'
      and (
        length(trim(coalesce(p_search, ''))) = 0
        or lower(wedding.couple_name) like '%' || lower(trim(p_search)) || '%'
        or regexp_replace(
          lower(wedding.couple_name),
          '[[:space:]&]+',
          '',
          'g'
        ) like '%' || regexp_replace(
          lower(trim(p_search)),
          '[[:space:]&]+',
          '',
          'g'
        ) || '%'
        or lower(wedding.slug) like '%' || lower(trim(p_search)) || '%'
      )
    group by wedding.id
  )
  select
    filtered.*,
    count(*) over()::bigint as total_count
  from filtered
  order by activated_at desc nulls last, created_at desc, id
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

create or replace function public.owner_list_cleanup_candidates_v1(
  p_now timestamptz default now()
)
returns table (
  id text,
  slug text,
  couple_name text,
  event_date date,
  timezone text,
  plan text,
  status text,
  storage_quota_bytes bigint,
  storage_used_bytes bigint,
  reserved_storage_bytes bigint,
  system_storage_bytes bigint,
  access_expires_at timestamptz,
  cleanup_after timestamptz,
  uploads_open_at timestamptz,
  upload_locked boolean,
  has_profile boolean,
  media_count bigint,
  created_at timestamptz,
  activated_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select
      wedding.id,
      wedding.slug,
      wedding.couple_name,
      wedding.event_date,
      wedding.timezone,
      wedding.plan,
      wedding.status,
      wedding.storage_quota_bytes,
      wedding.storage_used_bytes,
      wedding.reserved_storage_bytes,
      wedding.system_storage_bytes,
      wedding.access_expires_at,
      wedding.cleanup_after,
      wedding.uploads_open_at,
      wedding.upload_locked,
      wedding.profile_media_path is not null as has_profile,
      count(media.id)::bigint as media_count,
      wedding.created_at,
      wedding.activated_at,
      wedding.updated_at
    from public.weddings wedding
    left join public.wedding_media media on media.wedding_id = wedding.id
    where wedding.status = 'cleanup_pending'
      or (
        wedding.status = 'active'
        and wedding.cleanup_after is not null
        and wedding.cleanup_after <= p_now
      )
    group by wedding.id
  )
  select
    candidates.*,
    count(*) over()::bigint as total_count
  from candidates
  order by
    case when status = 'cleanup_pending' then 0 else 1 end,
    cleanup_after asc nulls last,
    id;
$$;

revoke all on function app_private.require_owner_session_v1(text, timestamptz)
  from public, anon, authenticated;

revoke all on function public.owner_setup_v1(
  text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.owner_create_session_v1(
  text, text, integer, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.owner_touch_session_v1(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.owner_logout_v1(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.owner_revoke_session_v1(
  text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.owner_change_password_v1(
  text, integer, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.owner_issue_token_v1(
  text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.owner_rotate_token_v1(
  text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.owner_revoke_token_v1(
  text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.owner_approve_cleanup_v1(
  text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.owner_finalize_cleanup_v1(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.owner_overview_v1(timestamptz)
  from public, anon, authenticated;
revoke all on function public.owner_list_weddings_v1(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.owner_list_cleanup_candidates_v1(timestamptz)
  from public, anon, authenticated;

grant execute on function public.owner_setup_v1(
  text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.owner_create_session_v1(
  text, text, integer, text, text, text, timestamptz
) to service_role;
grant execute on function public.owner_touch_session_v1(text, timestamptz)
  to service_role;
grant execute on function public.owner_logout_v1(text, timestamptz)
  to service_role;
grant execute on function public.owner_revoke_session_v1(
  text, text, text, timestamptz
) to service_role;
grant execute on function public.owner_change_password_v1(
  text, integer, text, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.owner_issue_token_v1(
  text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.owner_rotate_token_v1(
  text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.owner_revoke_token_v1(
  text, text, text, text, timestamptz
) to service_role;
grant execute on function public.owner_approve_cleanup_v1(
  text, text, text, timestamptz
) to service_role;
grant execute on function public.owner_finalize_cleanup_v1(text, timestamptz)
  to service_role;
grant execute on function public.owner_overview_v1(timestamptz)
  to service_role;
grant execute on function public.owner_list_weddings_v1(text, integer, integer)
  to service_role;
grant execute on function public.owner_list_cleanup_candidates_v1(timestamptz)
  to service_role;
