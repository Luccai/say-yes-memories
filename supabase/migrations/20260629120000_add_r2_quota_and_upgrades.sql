create or replace function public.make_studio_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'SY-' ||
    upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 4)) ||
    '-' ||
    upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 4));
$$;

alter table public.weddings
  add column if not exists studio_code text,
  add column if not exists plan text not null default 'classic' check (plan in ('classic', 'premium')),
  add column if not exists storage_quota_bytes bigint not null default 53687091200 check (storage_quota_bytes >= 0),
  add column if not exists storage_used_bytes bigint not null default 0 check (storage_used_bytes >= 0),
  add column if not exists access_anchor_date date,
  add column if not exists access_expires_at timestamptz,
  add column if not exists cleanup_after timestamptz;

do $$
declare
  wedding record;
  candidate text;
begin
  for wedding in select id from public.weddings where studio_code is null loop
    loop
      candidate := public.make_studio_code();
      exit when not exists (
        select 1 from public.weddings where studio_code = candidate
      );
    end loop;

    update public.weddings
    set studio_code = candidate
    where id = wedding.id;
  end loop;
end $$;

update public.weddings wedding
set storage_used_bytes = coalesce((
  select sum(media.byte_size)
  from public.wedding_media media
  where media.wedding_id = wedding.id
), 0)
where storage_used_bytes = 0;

update public.weddings
set
  access_anchor_date = coalesce(event_date, created_at::date),
  access_expires_at = case
    when event_date is not null then event_date::timestamp + interval '3 months' + interval '1 day' - interval '1 millisecond'
    else created_at + interval '6 months'
  end,
  cleanup_after = case
    when event_date is not null then event_date::timestamp + interval '3 months' + interval '30 days' + interval '1 day' - interval '1 millisecond'
    else created_at + interval '6 months' + interval '30 days'
  end
where access_expires_at is null;

alter table public.weddings
  alter column studio_code set not null;

create unique index if not exists weddings_studio_code_key on public.weddings(studio_code);
create index if not exists weddings_cleanup_after_idx
  on public.weddings(cleanup_after)
  where cleanup_after is not null;

create table if not exists public.upgrade_logs (
  id text primary key,
  wedding_id text not null references public.weddings(id) on delete cascade,
  studio_code text not null,
  upgrade_type text not null check (upgrade_type in ('premium_extension')),
  quota_delta_bytes bigint not null check (quota_delta_bytes > 0),
  access_delta_months integer not null check (access_delta_months > 0),
  etsy_order_number text not null check (length(trim(etsy_order_number)) > 0),
  note text,
  created_at timestamptz not null default now()
);

alter table public.upgrade_logs enable row level security;

create index if not exists upgrade_logs_wedding_created_idx
  on public.upgrade_logs(wedding_id, created_at desc);
create unique index if not exists upgrade_logs_order_unique_idx
  on public.upgrade_logs(lower(etsy_order_number));

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
set search_path = public
as $$
declare
  inserted_media public.wedding_media;
begin
  update public.weddings
  set storage_used_bytes = storage_used_bytes + p_byte_size
  where id = p_wedding_id
    and upload_locked = false
    and (access_expires_at is null or access_expires_at >= now())
    and storage_used_bytes + p_byte_size <= storage_quota_bytes;

  if not found then
    raise exception 'Storage quota exceeded or access expired.';
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
  )
  values (
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
  )
  returning * into inserted_media;

  return inserted_media;
end;
$$;

create or replace function public.apply_premium_extension(
  p_studio_code text,
  p_etsy_order_number text,
  p_note text default null
)
returns public.weddings
language plpgsql
security definer
set search_path = public
as $$
declare
  target_wedding public.weddings;
  base_expires_at timestamptz;
  next_expires_at timestamptz;
begin
  select *
  into target_wedding
  from public.weddings
  where studio_code = upper(trim(p_studio_code))
  for update;

  if not found then
    raise exception 'Studio code was not found.';
  end if;

  if length(trim(coalesce(p_etsy_order_number, ''))) = 0 then
    raise exception 'Etsy order number is required.';
  end if;

  if exists (
    select 1
    from public.upgrade_logs
    where lower(etsy_order_number) = lower(trim(p_etsy_order_number))
  ) then
    raise exception 'This Etsy order number was already applied.';
  end if;

  base_expires_at := greatest(coalesce(target_wedding.access_expires_at, now()), now());
  next_expires_at := base_expires_at + interval '6 months';

  update public.weddings
  set
    plan = 'premium',
    storage_quota_bytes = storage_quota_bytes + 53687091200,
    access_expires_at = next_expires_at,
    cleanup_after = next_expires_at + interval '30 days',
    updated_at = now()
  where id = target_wedding.id
  returning * into target_wedding;

  insert into public.upgrade_logs (
    id,
    wedding_id,
    studio_code,
    upgrade_type,
    quota_delta_bytes,
    access_delta_months,
    etsy_order_number,
    note
  )
  values (
    'upg_' || encode(extensions.gen_random_bytes(12), 'hex'),
    target_wedding.id,
    target_wedding.studio_code,
    'premium_extension',
    53687091200,
    6,
    trim(p_etsy_order_number),
    nullif(trim(coalesce(p_note, '')), '')
  );

  return target_wedding;
end;
$$;

create or replace function public.decrement_wedding_storage_usage(
  p_wedding_id text,
  p_byte_size bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.weddings
  set
    storage_used_bytes = greatest(storage_used_bytes - greatest(p_byte_size, 0), 0),
    updated_at = now()
  where id = p_wedding_id;
end;
$$;

revoke all on function public.make_studio_code() from public, anon, authenticated;
revoke all on function public.add_wedding_media_with_quota(
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  bigint,
  timestamptz,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.apply_premium_extension(text, text, text) from public, anon, authenticated;
revoke all on function public.decrement_wedding_storage_usage(text, bigint) from public, anon, authenticated;

grant execute on function public.add_wedding_media_with_quota(
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  bigint,
  timestamptz,
  text,
  text,
  timestamptz
) to service_role;
grant execute on function public.apply_premium_extension(text, text, text) to service_role;
grant execute on function public.decrement_wedding_storage_usage(text, bigint) to service_role;
