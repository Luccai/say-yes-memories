create extension if not exists pgcrypto;

create table if not exists public.weddings (
  id text primary key,
  slug text not null unique,
  bride_name text not null,
  groom_name text not null,
  couple_name text not null,
  event_date date,
  welcome_note text not null default '',
  upload_locked boolean not null default false,
  demo boolean not null default false,
  realtime_topic text not null unique default encode(gen_random_bytes(24), 'hex'),
  profile_media_id text,
  profile_media_path text,
  profile_media_kind text check (profile_media_kind in ('image', 'video', 'audio')),
  profile_media_mime_type text,
  profile_media_file_name text,
  profile_media_byte_size bigint,
  profile_media_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tokens (
  id text primary key,
  token_hash text not null unique,
  status text not null default 'unused' check (status in ('unused', 'active', 'revoked')),
  wedding_id text references public.weddings(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create table if not exists public.wedding_media (
  id text primary key,
  wedding_id text not null references public.weddings(id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('image', 'video', 'audio')),
  mime_type text not null,
  file_name text not null,
  byte_size bigint not null check (byte_size >= 0),
  guest_name text not null,
  note text,
  approved boolean not null default true,
  hidden boolean not null default false,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key,
  wedding_id text not null references public.weddings(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists tokens_status_idx on public.tokens(status);
create index if not exists sessions_wedding_id_idx on public.sessions(wedding_id);
create index if not exists sessions_expires_at_idx on public.sessions(expires_at);
create index if not exists wedding_media_wedding_created_idx on public.wedding_media(wedding_id, created_at desc);
create index if not exists wedding_media_favorite_idx on public.wedding_media(wedding_id, favorite) where favorite = true;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_weddings_updated_at on public.weddings;
create trigger set_weddings_updated_at
before update on public.weddings
for each row execute function public.set_updated_at();

drop trigger if exists set_wedding_media_updated_at on public.wedding_media;
create trigger set_wedding_media_updated_at
before update on public.wedding_media
for each row execute function public.set_updated_at();

alter table public.weddings enable row level security;
alter table public.tokens enable row level security;
alter table public.wedding_media enable row level security;
alter table public.sessions enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(pg_proc.oid) = ''
  ) then
    revoke execute on function public.rls_auto_enable() from public;
    revoke execute on function public.rls_auto_enable() from anon;
    revoke execute on function public.rls_auto_enable() from authenticated;
  end if;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'say-yes-memories',
  'say-yes-memories',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/webm',
    'audio/wav',
    'audio/x-wav',
    'audio/aac'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
