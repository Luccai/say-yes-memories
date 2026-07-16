do $hardening_contract$
declare
  attempt integer;
  rate_limited boolean := false;
  reservation_id text;
  media_id text;
  reservation public.upload_reservations;
begin
  insert into public.weddings (
    id, slug, studio_code, plan, storage_quota_bytes, storage_used_bytes,
    reserved_storage_bytes, bride_name, groom_name, couple_name, event_date,
    timezone, uploads_open_at, access_anchor_date, access_expires_at,
    cleanup_after, activated_at, welcome_note, upload_locked, demo, status
  ) values (
    'wed_hardening_contract', 'hardening-contract', 'SY-HARD-TEST', 'classic',
    53687091200, 0, 0, 'Hardening', 'Contract', 'Hardening & Contract',
    current_date - 1, 'UTC', now() - interval '1 day', current_date - 1,
    now() + interval '90 days', now() + interval '120 days', now(), '',
    false, false, 'active'
  );
  insert into public.wedding_slugs (slug, wedding_id, is_canonical)
  values ('hardening-contract', 'wed_hardening_contract', true);

  for attempt in 1..4 loop
    reservation_id := 'upload_' || lpad(attempt::text, 24, '0');
    media_id := 'asset_' || lpad(attempt::text, 24, '0');
    begin
      reservation := public.reserve_guest_upload_v2(
        p_id => reservation_id,
        p_client_request_key_hash => encode(digest('hardening-request-' || attempt, 'sha256'), 'hex'),
        p_secret_hash => encode(digest('hardening-secret-' || attempt, 'sha256'), 'hex'),
        p_media_id => media_id,
        p_wedding_id => 'wed_hardening_contract',
        p_mode => 'single',
        p_object_path => 'weddings/wed_hardening_contract/guest/' || media_id || '-memory.jpg',
        p_staging_object_path => 'weddings/wed_hardening_contract/upload-staging/' || reservation_id || '-memory.jpg',
        p_kind => 'image',
        p_mime_type => 'image/jpeg',
        p_file_name => 'memory.jpg',
        p_byte_size => 1024,
        p_part_size_bytes => 1024,
        p_part_count => 1,
        p_guest_name => 'Contract Guest',
        p_now => now(),
        p_abuse_key_hash => repeat('a', 64)
      );
    exception when others then
      if attempt = 4 and sqlerrm like '%rate limit exceeded%' then
        rate_limited := true;
      else
        raise;
      end if;
    end;
  end loop;
  if not rate_limited then
    raise exception 'Per-source outstanding upload budget was not enforced.';
  end if;

  update public.upload_reservations
  set status = 'completed', completed_at = now()
  where id = 'upload_000000000000000000000001';
  reservation := public.mark_upload_storage_cleanup_v1(
    'upload_000000000000000000000001', true, null, now()
  );
  if reservation.storage_cleaned_at is null then
    raise exception 'Completed reservation replay cleanup was not accepted.';
  end if;
end
$hardening_contract$;

select json_build_object(
  'hardening_contract', 'passed',
  'upload_abuse_budget', true,
  'completed_replay_cleanup', true
) as result;
