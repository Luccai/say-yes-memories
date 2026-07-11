-- Atomic authentication throttling. Keys are HMAC hashes created by the
-- server; raw IP addresses, tokens and studio slugs never enter this table.

create or replace function public.consume_rate_limit_v1(
  p_key_hash text,
  p_action text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_block_seconds integer,
  p_now timestamptz default now()
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining_attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket public.rate_limit_buckets;
  next_count integer;
  next_window_started_at timestamptz;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Rate-limit key hash is invalid.';
  end if;
  if p_action !~ '^[a-z0-9_.-]{1,64}$' then
    raise exception 'Rate-limit action is invalid.';
  end if;
  if p_max_attempts < 1
    or p_window_seconds < 1
    or p_block_seconds < 1 then
    raise exception 'Rate-limit policy is invalid.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rate-limit:' || p_key_hash, 0)
  );

  select *
  into bucket
  from public.rate_limit_buckets
  where key_hash = p_key_hash
  for update;

  if not found then
    insert into public.rate_limit_buckets (
      key_hash,
      action,
      attempt_count,
      window_started_at,
      blocked_until,
      updated_at
    ) values (
      p_key_hash,
      p_action,
      1,
      p_now,
      null,
      p_now
    );

    return query select true, 0, greatest(p_max_attempts - 1, 0);
    return;
  end if;

  if bucket.action <> p_action then
    raise exception 'Rate-limit key was reused for another action.';
  end if;

  if bucket.blocked_until is not null and bucket.blocked_until > p_now then
    return query select
      false,
      greatest(
        ceil(extract(epoch from (bucket.blocked_until - p_now)))::integer,
        1
      ),
      0;
    return;
  end if;

  if bucket.window_started_at + make_interval(secs => p_window_seconds) <= p_now then
    next_count := 1;
    next_window_started_at := p_now;
  else
    next_count := bucket.attempt_count + 1;
    next_window_started_at := bucket.window_started_at;
  end if;

  if next_count > p_max_attempts then
    update public.rate_limit_buckets
    set
      attempt_count = next_count,
      window_started_at = next_window_started_at,
      blocked_until = p_now + make_interval(secs => p_block_seconds),
      updated_at = p_now
    where key_hash = p_key_hash;

    return query select false, p_block_seconds, 0;
    return;
  end if;

  update public.rate_limit_buckets
  set
    attempt_count = next_count,
    window_started_at = next_window_started_at,
    blocked_until = null,
    updated_at = p_now
  where key_hash = p_key_hash;

  return query select true, 0, greatest(p_max_attempts - next_count, 0);
end;
$$;

create or replace function public.clear_rate_limit_v1(
  p_key_hash text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key_hash !~ '^[a-f0-9]{64}$'
    or p_action !~ '^[a-z0-9_.-]{1,64}$' then
    raise exception 'Rate-limit clear request is invalid.';
  end if;

  delete from public.rate_limit_buckets
  where key_hash = p_key_hash
    and action = p_action;
end;
$$;

revoke all on public.rate_limit_buckets from service_role;
grant select on public.rate_limit_buckets to service_role;

revoke all on function public.consume_rate_limit_v1(
  text, text, integer, integer, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.clear_rate_limit_v1(text, text)
  from public, anon, authenticated;

grant execute on function public.consume_rate_limit_v1(
  text, text, integer, integer, integer, timestamptz
) to service_role;
grant execute on function public.clear_rate_limit_v1(text, text)
  to service_role;
