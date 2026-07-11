-- Product-ready core: password/session hardening, one slug namespace,
-- append-only entitlements, owner operations, upload reservations and delete outbox.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

alter table public.weddings
  add column if not exists password_hash text,
  add column if not exists password_version integer not null default 1 check (password_version > 0),
  add column if not exists password_changed_at timestamptz,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists activated_at timestamptz,
  add column if not exists uploads_open_at timestamptz,
  add column if not exists legacy_access_expires_at timestamptz,
  add column if not exists legacy_storage_quota_bytes bigint check (
    legacy_storage_quota_bytes is null or legacy_storage_quota_bytes >= 0
  ),
  add column if not exists reserved_storage_bytes bigint not null default 0 check (reserved_storage_bytes >= 0),
  add column if not exists system_storage_bytes bigint not null default 0 check (system_storage_bytes >= 0),
  add column if not exists anonymized_at timestamptz,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'disabled', 'cleanup_pending', 'anonymized'));

update public.weddings
set activated_at = coalesce(activated_at, created_at)
where activated_at is null;

-- Reconstruct the legacy projection from its original rules before freezing
-- the pre-upgrade baseline. If a manual adjustment exists outside the legacy
-- upgrade log, fail closed so an owner can map it explicitly instead of losing
-- paid quota or time.
do $$
declare
  wedding record;
  upgrade record;
  projected_expiry timestamptz;
  projected_quota bigint;
begin
  for wedding in
    select * from public.weddings order by id
  loop
    projected_quota := 53687091200;
    projected_expiry := case
      when wedding.event_date is not null then
        wedding.event_date::timestamp
          + interval '3 months'
          + interval '1 day'
          - interval '1 millisecond'
      else wedding.created_at + interval '6 months'
    end;

    for upgrade in
      select *
      from public.upgrade_logs
      where wedding_id = wedding.id
      order by created_at, id
    loop
      projected_quota := projected_quota + upgrade.quota_delta_bytes;
      projected_expiry := greatest(projected_expiry, upgrade.created_at)
        + make_interval(months => upgrade.access_delta_months);
    end loop;

    if wedding.storage_quota_bytes is distinct from projected_quota
      or wedding.access_expires_at is distinct from projected_expiry
      or wedding.cleanup_after is distinct from projected_expiry + interval '30 days'
      or wedding.plan is distinct from (case
        when exists (
          select 1 from public.upgrade_logs where wedding_id = wedding.id
        ) then 'premium'
        else 'classic'
      end) then
      raise exception 'Legacy entitlement drift detected for wedding %; migration stopped.',
        wedding.id;
    end if;
  end loop;
end $$;

update public.weddings wedding
set
  legacy_access_expires_at = coalesce(
    wedding.legacy_access_expires_at,
    case
      when wedding.event_date is not null then
        wedding.event_date::timestamp
          + interval '3 months'
          + interval '1 day'
          - interval '1 millisecond'
      else wedding.created_at + interval '6 months'
    end
  ),
  legacy_storage_quota_bytes = coalesce(
    wedding.legacy_storage_quota_bytes,
    53687091200
  )
where wedding.legacy_access_expires_at is null
   or wedding.legacy_storage_quota_bytes is null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'weddings_password_or_legacy_activation_check'
      and conrelid = 'public.weddings'::regclass
  ) then
    alter table public.weddings
      add constraint weddings_password_or_legacy_activation_check
      check (password_hash is not null or activated_at is not null);
  end if;
end $$;

alter table public.tokens
  add column if not exists label text,
  add column if not exists revoked_at timestamptz,
  add column if not exists activation_key_hash text check (
    activation_key_hash is null or activation_key_hash ~ '^[a-f0-9]{64}$'
  ),
  add column if not exists activation_key_expires_at timestamptz,
  add column if not exists rotated_from_id text references public.tokens(id) on delete set null;

create index if not exists tokens_wedding_id_idx on public.tokens(wedding_id);
create index if not exists tokens_rotated_from_id_idx on public.tokens(rotated_from_id);

alter table public.sessions
  add column if not exists token_hash text,
  add column if not exists password_version integer not null default 1 check (password_version > 0),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'sessions_token_hash_format_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_token_hash_format_check
      check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$');
  end if;
end $$;

create unique index if not exists sessions_token_hash_key
  on public.sessions(token_hash)
  where token_hash is not null;

create or replace function app_private.prevent_passwordless_session_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_has_password boolean;
begin
  if new.token_hash is null then
    select password_hash is not null
    into target_has_password
    from public.weddings
    where id = new.wedding_id;

    if target_has_password then
      raise exception 'Password-protected memberships require a v2 session token.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sessions_require_v2_token on public.sessions;
create trigger sessions_require_v2_token
before insert on public.sessions
for each row execute function app_private.prevent_passwordless_session_insert();

create table if not exists public.wedding_slugs (
  slug text primary key,
  wedding_id text not null references public.weddings(id) on delete cascade,
  is_canonical boolean not null default false,
  created_at timestamptz not null default now(),
  check (slug = lower(slug)),
  check (length(slug) between 1 and 64)
);

do $$
begin
  if exists (
    select 1
    from public.weddings
    group by lower(slug)
    having count(*) > 1
  ) then
    raise exception 'Case-insensitive wedding slug collision detected; migration stopped.';
  end if;

  if exists (
    select 1
    from public.weddings
    where lower(slug) = any (array['mary-john', 'login', 'admin', 'owner', 'api'])
      and not (lower(slug) = 'mary-john' and demo = true)
  ) then
    raise exception 'A live wedding uses a reserved application slug; migration stopped.';
  end if;
end $$;

create unique index if not exists wedding_slugs_one_canonical_idx
  on public.wedding_slugs(wedding_id)
  where is_canonical = true;
create index if not exists wedding_slugs_wedding_id_idx
  on public.wedding_slugs(wedding_id);

insert into public.wedding_slugs (slug, wedding_id, is_canonical, created_at)
select lower(wedding.slug), wedding.id, true, wedding.created_at
from public.weddings wedding
on conflict (slug) do update
set is_canonical = true
where public.wedding_slugs.wedding_id = excluded.wedding_id;

do $$
begin
  if exists (
    select 1
    from public.weddings wedding
    left join public.wedding_slugs slug
      on slug.wedding_id = wedding.id
     and slug.is_canonical = true
    where slug.slug is null
  ) then
    raise exception 'Every wedding must have exactly one canonical slug.';
  end if;
end $$;

create table if not exists public.entitlement_events (
  id text primary key,
  wedding_id text not null references public.weddings(id) on delete restrict,
  operation_key text not null unique,
  event_type text not null check (
    event_type in (
      'activation',
      'premium_extension',
      'manual_adjustment',
      'reversal',
      'event_date_change'
    )
  ),
  quota_delta_bytes bigint not null default 0,
  access_delta_months integer not null default 0,
  applied_at timestamptz not null,
  reverses_event_id text references public.entitlement_events(id) on delete restrict,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (operation_key = lower(trim(operation_key)) and length(operation_key) > 0),
  check (
    (event_type = 'reversal' and reverses_event_id is not null)
    or (event_type <> 'reversal' and reverses_event_id is null)
  )
);

create index if not exists entitlement_events_wedding_applied_idx
  on public.entitlement_events(wedding_id, applied_at, id);
create unique index if not exists entitlement_events_one_reversal_idx
  on public.entitlement_events(reverses_event_id)
  where event_type = 'reversal';

insert into public.entitlement_events (
  id,
  wedding_id,
  operation_key,
  event_type,
  quota_delta_bytes,
  access_delta_months,
  applied_at,
  metadata,
  created_at
)
select
  'ent_legacy_activation_' || wedding.id,
  wedding.id,
  'legacy_activation:' || wedding.id,
  'activation',
  0,
  0,
  wedding.created_at,
  jsonb_build_object('source', 'migration'),
  wedding.created_at
from public.weddings wedding
on conflict (operation_key) do nothing;

do $$
begin
  if exists (
    select 1
    from public.upgrade_logs
    group by lower(trim(etsy_order_number))
    having count(*) > 1
  ) then
    raise exception 'Normalized legacy Etsy order collision detected; migration stopped.';
  end if;
end $$;

insert into public.entitlement_events (
  id,
  wedding_id,
  operation_key,
  event_type,
  quota_delta_bytes,
  access_delta_months,
  applied_at,
  note,
  metadata,
  created_at
)
select
  'ent_legacy_upgrade_' || upgrade.id,
  upgrade.wedding_id,
  'etsy-order:' || lower(trim(upgrade.etsy_order_number)),
  'premium_extension',
  upgrade.quota_delta_bytes,
  upgrade.access_delta_months,
  upgrade.created_at,
  upgrade.note,
  jsonb_build_object(
    'source', 'upgrade_logs',
    'legacy_upgrade_id', upgrade.id,
    'etsy_order_number', upgrade.etsy_order_number
  ),
  upgrade.created_at
from public.upgrade_logs upgrade
on conflict (operation_key) do nothing;

create table if not exists public.owner_credentials (
  id text primary key check (id = 'primary'),
  password_hash text not null,
  password_version integer not null default 1 check (password_version > 0),
  setup_completed_at timestamptz not null default now(),
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_sessions (
  id text primary key,
  token_hash text not null unique,
  password_version integer not null check (password_version > 0),
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists owner_sessions_expires_at_idx
  on public.owner_sessions(expires_at)
  where revoked_at is null;

create table if not exists public.owner_audit_logs (
  id text primary key,
  actor_session_id text references public.owner_sessions(id) on delete set null,
  action text not null,
  wedding_id text references public.weddings(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists owner_audit_logs_created_idx
  on public.owner_audit_logs(created_at desc);
create index if not exists owner_audit_logs_wedding_created_idx
  on public.owner_audit_logs(wedding_id, created_at desc)
  where wedding_id is not null;

create table if not exists public.system_health_checks (
  id text primary key,
  supabase_ok boolean not null,
  r2_ok boolean not null,
  supabase_latency_ms integer check (supabase_latency_ms is null or supabase_latency_ms >= 0),
  r2_latency_ms integer check (r2_latency_ms is null or r2_latency_ms >= 0),
  cleanup_candidate_count integer not null default 0 check (cleanup_candidate_count >= 0),
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

create index if not exists system_health_checks_checked_idx
  on public.system_health_checks(checked_at desc);

create table if not exists public.upload_reservations (
  id text primary key,
  wedding_id text not null references public.weddings(id) on delete cascade,
  secret_hash text not null unique,
  media_id text not null unique,
  mode text not null check (mode in ('single', 'multipart')),
  status text not null default 'pending'
    check (status in ('pending', 'uploading', 'completed', 'aborted', 'expired')),
  object_path text not null unique,
  thumbnail_path text unique,
  r2_upload_id text,
  kind text not null check (kind in ('image', 'video', 'audio')),
  mime_type text not null,
  file_name text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 5368709120),
  thumbnail_mime_type text,
  thumbnail_file_name text,
  thumbnail_byte_size bigint check (
    thumbnail_byte_size is null
    or (thumbnail_byte_size > 0 and thumbnail_byte_size <= 1048576)
  ),
  guest_name text not null,
  note text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  aborted_at timestamptz
);

create index if not exists upload_reservations_wedding_status_idx
  on public.upload_reservations(wedding_id, status, expires_at);
create index if not exists upload_reservations_expiry_idx
  on public.upload_reservations(expires_at)
  where status in ('pending', 'uploading');

create table if not exists public.upload_parts (
  reservation_id text not null references public.upload_reservations(id) on delete cascade,
  part_number integer not null check (part_number between 1 and 10000),
  etag text not null check (length(trim(etag)) > 0),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 5368709120),
  uploaded_at timestamptz not null default now(),
  primary key (reservation_id, part_number)
);

alter table public.wedding_media
  add column if not exists upload_reservation_id text
    references public.upload_reservations(id) on delete set null;

create unique index if not exists wedding_media_upload_reservation_key
  on public.wedding_media(upload_reservation_id)
  where upload_reservation_id is not null;

create table if not exists public.media_deletion_jobs (
  id text primary key,
  wedding_id text not null references public.weddings(id) on delete cascade,
  media_id text not null unique,
  object_path text not null,
  thumbnail_path text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists media_deletion_jobs_status_created_idx
  on public.media_deletion_jobs(status, created_at);

do $$
begin
  if exists (
    select 1
    from public.wedding_media
    group by storage_path
    having count(*) > 1
  ) then
    raise exception 'Duplicate wedding media storage paths detected; migration stopped.';
  end if;
end $$;

create unique index if not exists wedding_media_storage_path_key
  on public.wedding_media(storage_path);

create table if not exists public.rate_limit_buckets (
  key_hash text primary key,
  action text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  window_started_at timestamptz not null,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_action_updated_idx
  on public.rate_limit_buckets(action, updated_at);

alter table public.wedding_slugs enable row level security;
alter table public.entitlement_events enable row level security;
alter table public.owner_credentials enable row level security;
alter table public.owner_sessions enable row level security;
alter table public.owner_audit_logs enable row level security;
alter table public.system_health_checks enable row level security;
alter table public.upload_reservations enable row level security;
alter table public.upload_parts enable row level security;
alter table public.media_deletion_jobs enable row level security;
alter table public.rate_limit_buckets enable row level security;

revoke all on public.wedding_slugs from service_role;
grant select on public.wedding_slugs to service_role;
revoke all on public.wedding_slugs from public, anon, authenticated;
revoke all on public.entitlement_events from public, anon, authenticated;
revoke all on public.owner_credentials from public, anon, authenticated;
revoke all on public.owner_sessions from public, anon, authenticated;
revoke all on public.owner_audit_logs from public, anon, authenticated;
revoke all on public.system_health_checks from public, anon, authenticated;
revoke all on public.upload_reservations from public, anon, authenticated;
revoke all on public.upload_parts from public, anon, authenticated;
revoke all on public.media_deletion_jobs from public, anon, authenticated;
revoke all on public.rate_limit_buckets from public, anon, authenticated;

revoke all on public.entitlement_events from service_role;
grant select on public.entitlement_events to service_role;
grant select, insert, update, delete on public.owner_credentials to service_role;
grant select, insert, update, delete on public.owner_sessions to service_role;
revoke all on public.owner_audit_logs from service_role;
grant select on public.owner_audit_logs to service_role;
grant select, insert, update, delete on public.system_health_checks to service_role;
grant select, insert, update, delete on public.upload_reservations to service_role;
grant select, insert, update, delete on public.upload_parts to service_role;
grant select, insert, update, delete on public.media_deletion_jobs to service_role;
grant select, insert, update, delete on public.rate_limit_buckets to service_role;

create or replace function app_private.timezone_is_valid(p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  );
$$;

create or replace function app_private.local_day_start(
  p_date date,
  p_timezone text
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select p_date::timestamp at time zone p_timezone;
$$;

create or replace function app_private.local_day_end(
  p_date date,
  p_timezone text
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_date + 1)::timestamp at time zone p_timezone) - interval '1 millisecond';
$$;

create or replace function app_private.recalculate_wedding_entitlements(
  p_wedding_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.weddings;
  effective_event_date date;
  projected_expiry timestamptz;
  projected_quota bigint := 53687091200;
  anchor_date date;
  event record;
  has_premium boolean;
  use_legacy_baseline boolean;
  has_modern_entitlement boolean := false;
begin
  select *
  into target
  from public.weddings
  where id = p_wedding_id
  for update;

  if not found then
    raise exception 'Wedding was not found.';
  end if;

  if not app_private.timezone_is_valid(target.timezone) then
    raise exception 'Wedding timezone is invalid.';
  end if;

  effective_event_date := coalesce(
    target.event_date,
    (target.created_at at time zone target.timezone)::date
  );
  use_legacy_baseline := target.legacy_access_expires_at is not null
    and target.legacy_storage_quota_bytes is not null
    and target.password_changed_at is null
    and not exists (
      select 1
      from public.entitlement_events identity_change
      where identity_change.wedding_id = target.id
        and identity_change.event_type = 'event_date_change'
    );

  if use_legacy_baseline then
    projected_expiry := target.legacy_access_expires_at;
    projected_quota := target.legacy_storage_quota_bytes;
  else
    projected_expiry := app_private.local_day_end(
      (effective_event_date + interval '3 months')::date,
      target.timezone
    );
  end if;

  for event in
    select entitlement.*
    from public.entitlement_events entitlement
    where entitlement.wedding_id = target.id
      and entitlement.event_type in ('premium_extension', 'manual_adjustment')
      and not exists (
        select 1
        from public.entitlement_events reversal
        where reversal.event_type = 'reversal'
          and reversal.reverses_event_id = entitlement.id
          and reversal.wedding_id = entitlement.wedding_id
      )
    order by entitlement.applied_at, entitlement.id
  loop
    projected_quota := greatest(projected_quota + event.quota_delta_bytes, 0);

    if event.metadata ->> 'source' is distinct from 'upgrade_logs' then
      has_modern_entitlement := true;
    end if;

    if event.access_delta_months <> 0 then
      if use_legacy_baseline
        and event.metadata ->> 'source' = 'upgrade_logs' then
        projected_expiry := greatest(projected_expiry, event.applied_at)
          + make_interval(months => event.access_delta_months);
      else
        anchor_date := (
          greatest(projected_expiry, event.applied_at)
          at time zone target.timezone
        )::date;
        projected_expiry := app_private.local_day_end(
          (anchor_date + make_interval(months => event.access_delta_months))::date,
          target.timezone
        );
      end if;
    end if;
  end loop;

  select exists (
    select 1
    from public.entitlement_events entitlement
    where entitlement.wedding_id = target.id
      and entitlement.event_type = 'premium_extension'
      and not exists (
        select 1
        from public.entitlement_events reversal
        where reversal.event_type = 'reversal'
          and reversal.reverses_event_id = entitlement.id
          and reversal.wedding_id = entitlement.wedding_id
      )
  ) into has_premium;

  update public.weddings
  set
    plan = case when has_premium then 'premium' else 'classic' end,
    access_anchor_date = effective_event_date,
    uploads_open_at = app_private.local_day_start(effective_event_date, target.timezone),
    access_expires_at = projected_expiry,
    cleanup_after = case
      when use_legacy_baseline and not has_modern_entitlement then
        projected_expiry + interval '30 days'
      else app_private.local_day_end(
        ((projected_expiry at time zone target.timezone)::date + 30)::date,
        target.timezone
      )
    end,
    storage_quota_bytes = projected_quota,
    updated_at = now()
  where id = target.id;
end;
$$;

-- Preserve every pre-migration quota and expiry projection exactly. Existing
-- rows are recalculated only after an explicit owner date change or legacy
-- password claim, when the immutable upgrade ledger can be replayed safely.
update public.weddings wedding
set uploads_open_at = app_private.local_day_start(
  coalesce(wedding.event_date, wedding.access_anchor_date, wedding.created_at::date),
  wedding.timezone
)
where wedding.uploads_open_at is null;

create or replace function app_private.validate_entitlement_event_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  reversed_wedding_id text;
begin
  if new.event_type = 'reversal' then
    select wedding_id
    into reversed_wedding_id
    from public.entitlement_events
    where id = new.reverses_event_id;

    if reversed_wedding_id is null or reversed_wedding_id <> new.wedding_id then
      raise exception 'A reversal must target an entitlement from the same wedding.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists entitlement_events_validate_insert on public.entitlement_events;
create trigger entitlement_events_validate_insert
before insert on public.entitlement_events
for each row execute function app_private.validate_entitlement_event_insert();

create or replace function app_private.prevent_entitlement_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Entitlement events are append-only.' using errcode = '55000';
end;
$$;

drop trigger if exists entitlement_events_append_only on public.entitlement_events;
create trigger entitlement_events_append_only
before update or delete on public.entitlement_events
for each row execute function app_private.prevent_entitlement_event_mutation();

create or replace function public.activate_wedding_v2(
  p_token_hash text,
  p_activation_key_hash text,
  p_wedding_id text,
  p_session_id text,
  p_session_token_hash text,
  p_password_hash text,
  p_bride_name text,
  p_groom_name text,
  p_event_date date,
  p_timezone text,
  p_base_slug text,
  p_now timestamptz default now()
)
returns table (
  result_wedding_id text,
  result_slug text,
  result_session_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_token public.tokens;
  retry_wedding public.weddings;
  candidate_slug text;
  suffix text;
  suffix_number integer := 1;
  candidate_studio_code text;
begin
  if length(trim(coalesce(p_bride_name, ''))) = 0
    or length(trim(coalesce(p_groom_name, ''))) = 0
    or length(trim(p_bride_name)) > 80
    or length(trim(p_groom_name)) > 80 then
    raise exception 'Both names are required and must be 80 characters or fewer.';
  end if;

  if length(coalesce(p_password_hash, '')) < 20 then
    raise exception 'Password hash is invalid.';
  end if;

  if p_activation_key_hash !~ '^[a-f0-9]{64}$'
    or p_session_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Activation or session key hash is invalid.';
  end if;

  if not app_private.timezone_is_valid(p_timezone) then
    raise exception 'Timezone is invalid.';
  end if;

  if p_event_date is null
    or p_event_date < (p_now at time zone p_timezone)::date then
    raise exception 'Event date must be today or later.';
  end if;

  if p_base_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(p_base_slug) > 64 then
    raise exception 'Base slug is invalid.';
  end if;

  select *
  into target_token
  from public.tokens
  where token_hash = p_token_hash
  for update;

  if not found or target_token.status = 'revoked' then
    raise exception 'Token is invalid.';
  end if;

  if target_token.status = 'active' then
    if target_token.activation_key_hash is distinct from p_activation_key_hash
      or target_token.activation_key_expires_at is null
      or target_token.activation_key_expires_at <= p_now
      or target_token.wedding_id is null then
      raise exception 'Token is already activated.';
    end if;

    select *
    into retry_wedding
    from public.weddings
    where id = target_token.wedding_id
    for update;

    if not found
      or retry_wedding.status <> 'active'
      or retry_wedding.password_hash is null
      or lower(trim(retry_wedding.bride_name)) <> lower(trim(p_bride_name))
      or lower(trim(retry_wedding.groom_name)) <> lower(trim(p_groom_name))
      or retry_wedding.event_date is distinct from p_event_date
      or retry_wedding.timezone <> p_timezone then
      raise exception 'Activation retry does not match the original membership.';
    end if;

    insert into public.sessions (
      id,
      wedding_id,
      token_hash,
      password_version,
      created_at,
      last_seen_at,
      expires_at,
      revoked_at
    ) values (
      p_session_id,
      retry_wedding.id,
      p_session_token_hash,
      retry_wedding.password_version,
      p_now,
      p_now,
      p_now + interval '30 days',
      null
    ) on conflict (id) do nothing;

    if not exists (
      select 1
      from public.sessions
      where id = p_session_id
        and wedding_id = retry_wedding.id
        and token_hash = p_session_token_hash
        and password_version = retry_wedding.password_version
        and revoked_at is null
    ) then
      raise exception 'Activation retry session key conflicts with another session.';
    end if;

    return query select retry_wedding.id, retry_wedding.slug, p_session_id;
    return;
  end if;

  if target_token.status <> 'unused' then
    raise exception 'Token is unavailable.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wedding-slug-namespace', 0)
  );

  loop
    if suffix_number = 1
      and p_base_slug <> all (array['mary-john', 'login', 'admin', 'owner', 'api']) then
      candidate_slug := p_base_slug;
    else
      suffix_number := greatest(suffix_number, 2);
      suffix := '-' || suffix_number::text;
      candidate_slug := left(p_base_slug, 64 - length(suffix)) || suffix;
    end if;

    exit when not exists (
      select 1
      from public.wedding_slugs
      where slug = candidate_slug
    );
    suffix_number := greatest(suffix_number + 1, 2);
  end loop;

  loop
    candidate_studio_code := public.make_studio_code();
    exit when not exists (
      select 1 from public.weddings where studio_code = candidate_studio_code
    );
  end loop;

  insert into public.weddings (
    id,
    slug,
    studio_code,
    bride_name,
    groom_name,
    couple_name,
    event_date,
    timezone,
    password_hash,
    password_version,
    password_changed_at,
    activated_at,
    plan,
    storage_quota_bytes,
    storage_used_bytes,
    reserved_storage_bytes,
    system_storage_bytes,
    status,
    welcome_note,
    upload_locked,
    created_at,
    updated_at
  ) values (
    p_wedding_id,
    candidate_slug,
    candidate_studio_code,
    trim(p_bride_name),
    trim(p_groom_name),
    trim(p_bride_name) || ' & ' || trim(p_groom_name),
    p_event_date,
    p_timezone,
    p_password_hash,
    1,
    p_now,
    p_now,
    'classic',
    53687091200,
    0,
    0,
    0,
    'active',
    '',
    false,
    p_now,
    p_now
  );

  insert into public.wedding_slugs (slug, wedding_id, is_canonical, created_at)
  values (candidate_slug, p_wedding_id, true, p_now);

  update public.tokens
  set
    status = 'active',
    wedding_id = p_wedding_id,
    activated_at = p_now,
    activation_key_hash = p_activation_key_hash,
    activation_key_expires_at = p_now + interval '15 minutes',
    revoked_at = null
  where id = target_token.id;

  insert into public.entitlement_events (
    id,
    wedding_id,
    operation_key,
    event_type,
    applied_at,
    metadata,
    created_at
  ) values (
    'ent_activation_' || p_wedding_id,
    p_wedding_id,
    'activation:' || target_token.id,
    'activation',
    p_now,
    jsonb_build_object('token_id', target_token.id),
    p_now
  );

  perform app_private.recalculate_wedding_entitlements(p_wedding_id);

  insert into public.sessions (
    id,
    wedding_id,
    token_hash,
    password_version,
    created_at,
    last_seen_at,
    expires_at,
    revoked_at
  ) values (
    p_session_id,
    p_wedding_id,
    p_session_token_hash,
    1,
    p_now,
    p_now,
    p_now + interval '30 days',
    null
  );

  return query select p_wedding_id, candidate_slug, p_session_id;
end;
$$;

create or replace function public.create_wedding_session_v2(
  p_wedding_id text,
  p_session_id text,
  p_session_token_hash text,
  p_password_version integer,
  p_now timestamptz default now()
)
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  wedding public.weddings;
  created_session public.sessions;
begin
  if p_session_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Session token hash is invalid.';
  end if;

  select *
  into wedding
  from public.weddings
  where id = p_wedding_id
  for update;

  if not found
    or wedding.status <> 'active'
    or wedding.password_hash is null
    or wedding.password_version <> p_password_version then
    raise exception 'Wedding credentials changed or membership is unavailable.';
  end if;

  insert into public.sessions (
    id,
    wedding_id,
    token_hash,
    password_version,
    created_at,
    last_seen_at,
    expires_at,
    revoked_at
  ) values (
    p_session_id,
    wedding.id,
    p_session_token_hash,
    wedding.password_version,
    p_now,
    p_now,
    p_now + interval '30 days',
    null
  ) returning * into created_session;

  return created_session;
end;
$$;

create or replace function public.reset_wedding_password_v2(
  p_token_hash text,
  p_password_hash text,
  p_now timestamptz default now()
)
returns public.weddings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_token public.tokens;
  target_wedding public.weddings;
begin
  if length(coalesce(p_password_hash, '')) < 20 then
    raise exception 'Password hash is invalid.';
  end if;

  select *
  into target_token
  from public.tokens
  where token_hash = p_token_hash
    and status = 'active'
    and wedding_id is not null
  for update;

  if not found then
    raise exception 'Token is invalid.';
  end if;

  select *
  into target_wedding
  from public.weddings
  where id = target_token.wedding_id
  for update;

  if not found
    or target_wedding.status <> 'active'
    or target_wedding.password_hash is null then
    raise exception 'Membership is unavailable.';
  end if;

  update public.weddings
  set
    password_hash = p_password_hash,
    password_version = password_version + 1,
    password_changed_at = p_now,
    updated_at = p_now
  where id = target_wedding.id
  returning * into target_wedding;

  update public.sessions
  set
    revoked_at = p_now,
    expires_at = least(expires_at, p_now)
  where wedding_id = target_wedding.id
    and revoked_at is null;

  update public.tokens
  set
    activation_key_hash = null,
    activation_key_expires_at = null
  where id = target_token.id;

  return target_wedding;
end;
$$;

create or replace function public.claim_legacy_wedding_password_v2(
  p_token_hash text,
  p_password_hash text,
  p_event_date date,
  p_timezone text,
  p_now timestamptz default now()
)
returns public.weddings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_token public.tokens;
  target_wedding public.weddings;
begin
  if length(coalesce(p_password_hash, '')) < 20 then
    raise exception 'Password hash is invalid.';
  end if;
  if not app_private.timezone_is_valid(p_timezone) then
    raise exception 'Timezone is invalid.';
  end if;
  if p_event_date is null or p_event_date < (p_now at time zone p_timezone)::date then
    raise exception 'Event date must be today or later.';
  end if;

  select *
  into target_token
  from public.tokens
  where token_hash = p_token_hash
    and status = 'active'
    and wedding_id is not null
  for update;

  if not found then
    raise exception 'Token is invalid.';
  end if;

  select *
  into target_wedding
  from public.weddings
  where id = target_token.wedding_id
  for update;

  if not found or target_wedding.password_hash is not null then
    raise exception 'Legacy membership cannot be claimed.';
  end if;

  update public.weddings
  set
    password_hash = p_password_hash,
    password_version = password_version + 1,
    password_changed_at = p_now,
    event_date = p_event_date,
    timezone = p_timezone,
    status = 'active',
    updated_at = p_now
  where id = target_wedding.id
  returning * into target_wedding;

  update public.sessions
  set
    revoked_at = p_now,
    expires_at = least(expires_at, p_now)
  where wedding_id = target_wedding.id
    and revoked_at is null;

  perform app_private.recalculate_wedding_entitlements(target_wedding.id);
  select wedding.*
  into target_wedding
  from public.weddings wedding
  where wedding.id = target_wedding.id;
  return target_wedding;
end;
$$;

create or replace function public.resolve_wedding_slug_v2(p_slug text)
returns table (
  result_wedding_id text,
  result_canonical_slug text,
  result_is_alias boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    requested.wedding_id,
    canonical.slug,
    not requested.is_canonical
  from public.wedding_slugs requested
  join public.wedding_slugs canonical
    on canonical.wedding_id = requested.wedding_id
   and canonical.is_canonical = true
  where requested.slug = lower(trim(p_slug))
  limit 1;
$$;

create or replace function public.owner_update_wedding_identity_v2(
  p_wedding_id text,
  p_bride_name text,
  p_groom_name text,
  p_event_date date,
  p_timezone text,
  p_base_slug text,
  p_operation_key text,
  p_note text default null,
  p_now timestamptz default now()
)
returns public.weddings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.weddings;
  existing_event public.entitlement_events;
  old_slug text;
  candidate_slug text;
  suffix text;
  suffix_number integer := 1;
  normalized_operation_key text;
begin
  normalized_operation_key := lower(trim(coalesce(p_operation_key, '')));
  if length(normalized_operation_key) = 0 then
    raise exception 'Operation key is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entitlement-operation:' || normalized_operation_key, 0)
  );

  select * into target
  from public.weddings
  where id = p_wedding_id
  for update;

  if not found then
    raise exception 'Wedding was not found.';
  end if;

  select * into existing_event
  from public.entitlement_events
  where operation_key = normalized_operation_key;

  if found then
    if existing_event.wedding_id <> target.id
      or existing_event.event_type <> 'event_date_change' then
      raise exception 'Operation key was already used for another action.';
    end if;
    return target;
  end if;

  if length(trim(coalesce(p_bride_name, ''))) = 0
    or length(trim(coalesce(p_groom_name, ''))) = 0
    or length(trim(p_bride_name)) > 80
    or length(trim(p_groom_name)) > 80 then
    raise exception 'Both names are required and must be 80 characters or fewer.';
  end if;
  if p_event_date is null then
    raise exception 'Event date is required.';
  end if;
  if not app_private.timezone_is_valid(p_timezone) then
    raise exception 'Timezone is invalid.';
  end if;
  if p_base_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(p_base_slug) > 64 then
    raise exception 'Base slug is invalid.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wedding-slug-namespace', 0)
  );
  old_slug := target.slug;

  loop
    if suffix_number = 1
      and p_base_slug <> all (array['mary-john', 'login', 'admin', 'owner', 'api']) then
      candidate_slug := p_base_slug;
    else
      suffix_number := greatest(suffix_number, 2);
      suffix := '-' || suffix_number::text;
      candidate_slug := left(p_base_slug, 64 - length(suffix)) || suffix;
    end if;

    exit when not exists (
      select 1
      from public.wedding_slugs
      where slug = candidate_slug
        and wedding_id <> target.id
    );
    suffix_number := greatest(suffix_number + 1, 2);
  end loop;

  update public.wedding_slugs
  set is_canonical = false
  where wedding_id = target.id
    and is_canonical = true;

  insert into public.wedding_slugs (slug, wedding_id, is_canonical, created_at)
  values (candidate_slug, target.id, true, p_now)
  on conflict (slug) do update
  set is_canonical = true
  where public.wedding_slugs.wedding_id = target.id;

  update public.weddings
  set
    slug = candidate_slug,
    bride_name = trim(p_bride_name),
    groom_name = trim(p_groom_name),
    couple_name = trim(p_bride_name) || ' & ' || trim(p_groom_name),
    event_date = p_event_date,
    timezone = p_timezone,
    updated_at = p_now
  where id = target.id
  returning * into target;

  insert into public.entitlement_events (
    id,
    wedding_id,
    operation_key,
    event_type,
    applied_at,
    note,
    metadata,
    created_at
  ) values (
    'ent_' || encode(extensions.gen_random_bytes(12), 'hex'),
    target.id,
    normalized_operation_key,
    'event_date_change',
    p_now,
    nullif(trim(coalesce(p_note, '')), ''),
    jsonb_build_object(
      'old_slug', old_slug,
      'new_slug', candidate_slug,
      'event_date', p_event_date,
      'timezone', p_timezone
    ),
    p_now
  );

  perform app_private.recalculate_wedding_entitlements(target.id);

  insert into public.owner_audit_logs (
    id,
    action,
    wedding_id,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    'wedding.identity_updated',
    target.id,
    jsonb_build_object(
      'operation_key', normalized_operation_key,
      'old_slug', old_slug,
      'new_slug', candidate_slug
    ),
    p_now
  );

  select * into target from public.weddings where id = target.id;
  return target;
end;
$$;

create or replace function public.apply_premium_extension_v2(
  p_wedding_id text,
  p_operation_key text,
  p_note text default null,
  p_now timestamptz default now()
)
returns public.weddings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.weddings;
  existing_event public.entitlement_events;
  normalized_operation_key text;
begin
  normalized_operation_key := lower(trim(coalesce(p_operation_key, '')));
  if length(normalized_operation_key) = 0 then
    raise exception 'Operation key is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entitlement-operation:' || normalized_operation_key, 0)
  );

  select * into target
  from public.weddings
  where id = p_wedding_id
  for update;

  if not found then
    raise exception 'Wedding was not found.';
  end if;
  select * into existing_event
  from public.entitlement_events
  where operation_key = normalized_operation_key;

  if found then
    if existing_event.wedding_id <> target.id
      or existing_event.event_type <> 'premium_extension' then
      raise exception 'Operation key was already used for another action.';
    end if;
    return target;
  end if;

  insert into public.entitlement_events (
    id,
    wedding_id,
    operation_key,
    event_type,
    quota_delta_bytes,
    access_delta_months,
    applied_at,
    note,
    metadata,
    created_at
  ) values (
    'ent_' || encode(extensions.gen_random_bytes(12), 'hex'),
    target.id,
    normalized_operation_key,
    'premium_extension',
    53687091200,
    6,
    p_now,
    nullif(trim(coalesce(p_note, '')), ''),
    jsonb_build_object('source', 'owner_cockpit'),
    p_now
  );

  perform app_private.recalculate_wedding_entitlements(target.id);

  insert into public.owner_audit_logs (
    id,
    action,
    wedding_id,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    'entitlement.premium_extension_applied',
    target.id,
    jsonb_build_object('operation_key', normalized_operation_key),
    p_now
  );

  select * into target from public.weddings where id = target.id;
  return target;
end;
$$;

-- Rolling-deploy compatibility: old application builds still call the Studio
-- Code + Etsy order RPC. Keep the signature, but route every call through the
-- immutable v2 ledger so old and new builds cannot disagree about entitlements.
create or replace function public.apply_premium_extension(
  p_studio_code text,
  p_etsy_order_number text,
  p_note text default null
)
returns public.weddings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.weddings;
  upgraded public.weddings;
  normalized_order_number text;
begin
  normalized_order_number := lower(trim(coalesce(p_etsy_order_number, '')));
  if length(normalized_order_number) = 0 then
    raise exception 'Etsy order number is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'entitlement-operation:etsy-order:' || normalized_order_number,
      0
    )
  );

  select *
  into target
  from public.weddings
  where studio_code = upper(trim(p_studio_code))
  for update;

  if not found then
    raise exception 'Studio code was not found.';
  end if;

  upgraded := public.apply_premium_extension_v2(
    target.id,
    'etsy-order:' || normalized_order_number,
    p_note,
    now()
  );

  insert into public.upgrade_logs (
    id,
    wedding_id,
    studio_code,
    upgrade_type,
    quota_delta_bytes,
    access_delta_months,
    etsy_order_number,
    note,
    created_at
  ) values (
    'upg_' || encode(extensions.gen_random_bytes(12), 'hex'),
    target.id,
    target.studio_code,
    'premium_extension',
    53687091200,
    6,
    trim(p_etsy_order_number),
    nullif(trim(coalesce(p_note, '')), ''),
    now()
  ) on conflict do nothing;

  return upgraded;
end;
$$;

create or replace function public.reverse_entitlement_event_v2(
  p_event_id text,
  p_operation_key text,
  p_reason text,
  p_now timestamptz default now()
)
returns public.weddings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.entitlement_events;
  existing_reversal public.entitlement_events;
  target public.weddings;
  normalized_operation_key text;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A correction reason is required.';
  end if;
  normalized_operation_key := lower(trim(coalesce(p_operation_key, '')));
  if length(normalized_operation_key) = 0 then
    raise exception 'Operation key is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entitlement-operation:' || normalized_operation_key, 0)
  );

  select * into target_event
  from public.entitlement_events
  where id = p_event_id
    and event_type in ('premium_extension', 'manual_adjustment')
  for update;

  if not found then
    raise exception 'Reversible entitlement event was not found.';
  end if;

  select * into target
  from public.weddings
  where id = target_event.wedding_id
  for update;

  select * into existing_reversal
  from public.entitlement_events
  where operation_key = normalized_operation_key;

  if found then
    if existing_reversal.event_type <> 'reversal'
      or existing_reversal.wedding_id <> target.id
      or existing_reversal.reverses_event_id is distinct from target_event.id then
      raise exception 'Operation key was already used for another action.';
    end if;
    return target;
  end if;

  if exists (
    select 1
    from public.entitlement_events
    where event_type = 'reversal'
      and reverses_event_id = target_event.id
  ) then
    raise exception 'Entitlement event was already reversed.';
  end if;

  insert into public.entitlement_events (
    id,
    wedding_id,
    operation_key,
    event_type,
    quota_delta_bytes,
    access_delta_months,
    applied_at,
    reverses_event_id,
    note,
    metadata,
    created_at
  ) values (
    'ent_' || encode(extensions.gen_random_bytes(12), 'hex'),
    target.id,
    normalized_operation_key,
    'reversal',
    -target_event.quota_delta_bytes,
    -target_event.access_delta_months,
    p_now,
    target_event.id,
    trim(p_reason),
    jsonb_build_object('source', 'owner_cockpit'),
    p_now
  );

  perform app_private.recalculate_wedding_entitlements(target.id);

  insert into public.owner_audit_logs (
    id,
    action,
    wedding_id,
    details,
    created_at
  ) values (
    'audit_' || encode(extensions.gen_random_bytes(12), 'hex'),
    'entitlement.event_reversed',
    target.id,
    jsonb_build_object(
      'operation_key', normalized_operation_key,
      'reversed_event_id', target_event.id,
      'reason', trim(p_reason)
    ),
    p_now
  );

  select * into target from public.weddings where id = target.id;
  return target;
end;
$$;

create or replace function public.queue_media_deletion_v2(
  p_media_id text,
  p_wedding_id text,
  p_now timestamptz default now()
)
returns public.media_deletion_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  media public.wedding_media;
  deletion_job public.media_deletion_jobs;
begin
  select * into media
  from public.wedding_media
  where id = p_media_id
    and wedding_id = p_wedding_id
  for update;

  if not found then
    select * into deletion_job
    from public.media_deletion_jobs
    where media_id = p_media_id
      and wedding_id = p_wedding_id;

    if found then
      return deletion_job;
    end if;
    raise exception 'Media was not found.';
  end if;

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
    media.wedding_id,
    media.id,
    media.storage_path,
    media.thumbnail_path,
    'pending',
    0,
    p_now
  ) returning * into deletion_job;

  delete from public.wedding_media
  where id = media.id
    and wedding_id = media.wedding_id;

  update public.weddings
  set
    storage_used_bytes = greatest(storage_used_bytes - media.byte_size, 0),
    updated_at = p_now
  where id = media.wedding_id;

  return deletion_job;
end;
$$;

-- Rolling-deploy compatibility for old upload completion calls. The old RPC
-- remains callable briefly, but now respects opening time, membership status
-- and v2 quota reservations so it cannot oversubscribe storage.
create or replace function public.add_wedding_media_with_quota(
  p_id text,
  p_wedding_id text,
  p_storage_path text,
  p_kind text,
  p_mime_type text,
  p_file_name text,
  p_byte_size bigint,
  p_thumbnail_id text,
  p_thumbnail_path text,
  p_thumbnail_mime_type text,
  p_thumbnail_file_name text,
  p_thumbnail_byte_size bigint,
  p_thumbnail_created_at timestamptz,
  p_guest_name text,
  p_note text,
  p_created_at timestamptz
)
returns public.wedding_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_media public.wedding_media;
begin
  if p_byte_size <= 0 then
    raise exception 'Media byte size must be positive.';
  end if;

  update public.weddings
  set
    storage_used_bytes = storage_used_bytes + p_byte_size,
    updated_at = p_created_at
  where id = p_wedding_id
    and status = 'active'
    and upload_locked = false
    and uploads_open_at <= p_created_at
    and access_expires_at >= p_created_at
    and storage_used_bytes + reserved_storage_bytes + p_byte_size
      <= storage_quota_bytes;

  if not found then
    raise exception 'Storage quota exceeded or uploads are unavailable.';
  end if;

  insert into public.wedding_media (
    id,
    wedding_id,
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
    p_id,
    p_wedding_id,
    p_storage_path,
    p_kind,
    p_mime_type,
    p_file_name,
    p_byte_size,
    p_thumbnail_id,
    p_thumbnail_path,
    p_thumbnail_mime_type,
    p_thumbnail_file_name,
    p_thumbnail_byte_size,
    p_thumbnail_created_at,
    p_guest_name,
    p_note,
    true,
    false,
    false,
    p_created_at,
    p_created_at
  ) returning * into inserted_media;

  return inserted_media;
end;
$$;

-- The old delete path supplies a client-derived byte count. Ignore it and
-- rebuild usage from authoritative media rows so retries cannot double-credit
-- quota during the deployment transition.
create or replace function public.decrement_wedding_storage_usage(
  p_wedding_id text,
  p_byte_size bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.weddings wedding
  set
    storage_used_bytes = coalesce((
      select sum(media.byte_size)
      from public.wedding_media media
      where media.wedding_id = wedding.id
    ), 0),
    updated_at = now()
  where wedding.id = p_wedding_id;
end;
$$;

drop trigger if exists set_owner_credentials_updated_at on public.owner_credentials;
create trigger set_owner_credentials_updated_at
before update on public.owner_credentials
for each row execute function public.set_updated_at();

revoke all on function app_private.timezone_is_valid(text) from public, anon, authenticated;
revoke all on function app_private.prevent_passwordless_session_insert() from public, anon, authenticated;
revoke all on function app_private.local_day_start(date, text) from public, anon, authenticated;
revoke all on function app_private.local_day_end(date, text) from public, anon, authenticated;
revoke all on function app_private.recalculate_wedding_entitlements(text) from public, anon, authenticated;
revoke all on function app_private.validate_entitlement_event_insert() from public, anon, authenticated;
revoke all on function app_private.prevent_entitlement_event_mutation() from public, anon, authenticated;

revoke all on function public.activate_wedding_v2(
  text, text, text, text, text, text, text, text, date, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.create_wedding_session_v2(
  text, text, text, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.reset_wedding_password_v2(
  text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.claim_legacy_wedding_password_v2(
  text, text, date, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.resolve_wedding_slug_v2(text)
  from public, anon, authenticated;
revoke all on function public.owner_update_wedding_identity_v2(
  text, text, text, date, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.apply_premium_extension_v2(
  text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.apply_premium_extension(text, text, text)
  from public, anon, authenticated;
revoke all on function public.reverse_entitlement_event_v2(
  text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.queue_media_deletion_v2(
  text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.add_wedding_media_with_quota(
  text, text, text, text, text, text, bigint, text, text, text, text,
  bigint, timestamptz, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.decrement_wedding_storage_usage(text, bigint)
  from public, anon, authenticated;

grant execute on function public.activate_wedding_v2(
  text, text, text, text, text, text, text, text, date, text, text, timestamptz
) to service_role;
grant execute on function public.create_wedding_session_v2(
  text, text, text, integer, timestamptz
) to service_role;
grant execute on function public.reset_wedding_password_v2(
  text, text, timestamptz
) to service_role;
grant execute on function public.claim_legacy_wedding_password_v2(
  text, text, date, text, timestamptz
) to service_role;
grant execute on function public.resolve_wedding_slug_v2(text) to service_role;
grant execute on function public.owner_update_wedding_identity_v2(
  text, text, text, date, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.apply_premium_extension_v2(
  text, text, text, timestamptz
) to service_role;
grant execute on function public.apply_premium_extension(text, text, text)
  to service_role;
grant execute on function public.reverse_entitlement_event_v2(
  text, text, text, timestamptz
) to service_role;
grant execute on function public.queue_media_deletion_v2(
  text, text, timestamptz
) to service_role;
grant execute on function public.add_wedding_media_with_quota(
  text, text, text, text, text, text, bigint, text, text, text, text,
  bigint, timestamptz, text, text, timestamptz
) to service_role;
grant execute on function public.decrement_wedding_storage_usage(text, bigint)
  to service_role;
