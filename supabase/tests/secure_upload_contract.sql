-- Run after the product-ready core and secure multipart migrations inside a
-- transaction that is always rolled back. Every ID belongs to this test only.
do $contract$
declare
  quota_blocked boolean := false;
  metadata_blocked boolean := false;
  completed_abort_blocked boolean := false;
  used_bytes bigint;
  reserved_bytes bigint;
  system_bytes bigint;
  media_count integer;
begin
  insert into public.weddings (
    id, slug, studio_code, plan, storage_quota_bytes, storage_used_bytes,
    reserved_storage_bytes, bride_name, groom_name, couple_name, event_date,
    timezone, uploads_open_at, access_anchor_date, access_expires_at,
    cleanup_after, activated_at, welcome_note, upload_locked, demo, status
  ) values (
    'wed_upload_contract', 'upload-contract', 'SY-UPLD-TEST', 'classic',
    209715200, 52428800, 0, 'Upload', 'Contract', 'Upload & Contract',
    current_date - 1, 'UTC', now() - interval '2 days', current_date - 1,
    now() + interval '90 days', now() + interval '120 days',
    now() - interval '2 days', '', false, false, 'active'
  );
  insert into public.wedding_slugs (slug, wedding_id, is_canonical)
  values ('upload-contract', 'wed_upload_contract', true);

  update public.weddings
  set profile_media_byte_size = 512
  where id = 'wed_upload_contract';
  update public.weddings
  set profile_media_byte_size = 256
  where id = 'wed_upload_contract';

  perform public.reserve_guest_upload_v1(
    p_id => 'upload_aaaaaaaaaaaaaaaaaaaaaaaa',
    p_client_request_key_hash => encode(digest('request-a', 'sha256'), 'hex'),
    p_secret_hash => encode(digest('secret-a', 'sha256'), 'hex'),
    p_media_id => 'asset_111111111111111111111111',
    p_wedding_id => 'wed_upload_contract', p_mode => 'single',
    p_object_path => 'weddings/wed_upload_contract/guest/asset_111111111111111111111111-memory.jpg',
    p_staging_object_path => 'weddings/wed_upload_contract/upload-staging/upload_aaaaaaaaaaaaaaaaaaaaaaaa-memory.jpg',
    p_kind => 'image', p_mime_type => 'image/jpeg',
    p_file_name => 'memory.jpg', p_byte_size => 104857600,
    p_part_size_bytes => 104857600, p_part_count => 1,
    p_guest_name => 'Guest A', p_now => now()
  );

  -- Same client request is an idempotent retry, not a second reservation.
  perform public.reserve_guest_upload_v1(
    p_id => 'upload_aaaaaaaaaaaaaaaaaaaaaaaa',
    p_client_request_key_hash => encode(digest('request-a', 'sha256'), 'hex'),
    p_secret_hash => encode(digest('secret-a', 'sha256'), 'hex'),
    p_media_id => 'asset_111111111111111111111111',
    p_wedding_id => 'wed_upload_contract', p_mode => 'single',
    p_object_path => 'weddings/wed_upload_contract/guest/asset_111111111111111111111111-memory.jpg',
    p_staging_object_path => 'weddings/wed_upload_contract/upload-staging/upload_aaaaaaaaaaaaaaaaaaaaaaaa-memory.jpg',
    p_kind => 'image', p_mime_type => 'image/jpeg',
    p_file_name => 'memory.jpg', p_byte_size => 104857600,
    p_part_size_bytes => 104857600, p_part_count => 1,
    p_guest_name => 'Guest A', p_now => now()
  );

  select storage_used_bytes, reserved_storage_bytes
  into used_bytes, reserved_bytes
  from public.weddings where id = 'wed_upload_contract';
  if used_bytes <> 52428800 or reserved_bytes <> 104857600 then
    raise exception 'Idempotent reservation changed quota twice: used %, reserved %',
      used_bytes, reserved_bytes;
  end if;

  begin
    perform public.reserve_guest_upload_v1(
      p_id => 'upload_dddddddddddddddddddddddd',
      p_client_request_key_hash => encode(digest('request-b', 'sha256'), 'hex'),
      p_secret_hash => encode(digest('secret-b', 'sha256'), 'hex'),
      p_media_id => 'asset_222222222222222222222222',
      p_wedding_id => 'wed_upload_contract', p_mode => 'single',
      p_object_path => 'weddings/wed_upload_contract/guest/asset_222222222222222222222222-other.jpg',
      p_staging_object_path => 'weddings/wed_upload_contract/upload-staging/upload_dddddddddddddddddddddddd-other.jpg',
      p_kind => 'image', p_mime_type => 'image/jpeg',
      p_file_name => 'other.jpg', p_byte_size => 62914560,
      p_part_size_bytes => 62914560, p_part_count => 1,
      p_guest_name => 'Guest B', p_now => now()
    );
  exception when others then
    if sqlerrm like '%Storage quota exceeded%' then
      quota_blocked := true;
    else
      raise;
    end if;
  end;
  if not quota_blocked then
    raise exception 'Concurrent quota oversubscription was not blocked.';
  end if;

  perform public.abort_upload_reservation_v1(
    'upload_aaaaaaaaaaaaaaaaaaaaaaaa',
    encode(digest('secret-a', 'sha256'), 'hex'), now()
  );
  perform public.abort_upload_reservation_v1(
    'upload_aaaaaaaaaaaaaaaaaaaaaaaa',
    encode(digest('secret-a', 'sha256'), 'hex'), now()
  );
  select reserved_storage_bytes into reserved_bytes
  from public.weddings where id = 'wed_upload_contract';
  if reserved_bytes <> 0 then
    raise exception 'Repeated abort released quota incorrectly: %', reserved_bytes;
  end if;

  -- A 24-hour stale reservation releases quota only once.
  perform public.reserve_guest_upload_v1(
    p_id => 'upload_999999999999999999999999',
    p_client_request_key_hash => encode(digest('request-expired', 'sha256'), 'hex'),
    p_secret_hash => encode(digest('secret-expired', 'sha256'), 'hex'),
    p_media_id => 'asset_333333333333333333333333',
    p_wedding_id => 'wed_upload_contract', p_mode => 'single',
    p_object_path => 'weddings/wed_upload_contract/guest/asset_333333333333333333333333-old.jpg',
    p_staging_object_path => 'weddings/wed_upload_contract/upload-staging/upload_999999999999999999999999-old.jpg',
    p_kind => 'image', p_mime_type => 'image/jpeg',
    p_file_name => 'old.jpg', p_byte_size => 10485760,
    p_part_size_bytes => 10485760, p_part_count => 1,
    p_guest_name => 'Old Guest', p_now => now() - interval '25 hours'
  );
  perform public.expire_upload_reservation_v1(
    'upload_999999999999999999999999', now()
  );
  perform public.expire_upload_reservation_v1(
    'upload_999999999999999999999999', now()
  );
  select reserved_storage_bytes into reserved_bytes
  from public.weddings where id = 'wed_upload_contract';
  if reserved_bytes <> 0 then
    raise exception 'Repeated expiry released quota incorrectly: %', reserved_bytes;
  end if;

  -- 150 MiB becomes 64 + 64 + 22 MiB and completes exactly once.
  perform public.reserve_guest_upload_v1(
    p_id => 'upload_cccccccccccccccccccccccc',
    p_client_request_key_hash => encode(digest('request-c', 'sha256'), 'hex'),
    p_secret_hash => encode(digest('secret-c', 'sha256'), 'hex'),
    p_media_id => 'asset_444444444444444444444444',
    p_wedding_id => 'wed_upload_contract', p_mode => 'multipart',
    p_object_path => 'weddings/wed_upload_contract/guest/asset_444444444444444444444444-video.mp4',
    p_staging_object_path => 'weddings/wed_upload_contract/upload-staging/upload_cccccccccccccccccccccccc-video.mp4',
    p_kind => 'video', p_mime_type => 'video/mp4',
    p_file_name => 'video.mp4', p_byte_size => 157286400,
    p_part_size_bytes => 67108864, p_part_count => 3,
    p_thumbnail_path => 'weddings/wed_upload_contract/guest-thumbnail/asset_444444444444444444444444-thumb-video.jpg',
    p_thumbnail_staging_path => 'weddings/wed_upload_contract/upload-staging/upload_cccccccccccccccccccccccc-thumb-video.jpg',
    p_thumbnail_mime_type => 'image/jpeg',
    p_thumbnail_file_name => 'video-thumbnail.jpg',
    p_thumbnail_byte_size => 12345,
    p_guest_name => 'Guest C', p_note => 'Memory', p_now => now()
  );
  perform public.attach_multipart_upload_v1(
    'upload_cccccccccccccccccccccccc',
    encode(digest('secret-c', 'sha256'), 'hex'),
    'r2-contract-upload-id', now()
  );
  perform public.record_upload_part_v1(
    'upload_cccccccccccccccccccccccc',
    encode(digest('secret-c', 'sha256'), 'hex'),
    1, '"etag-1"', 67108864, now()
  );
  perform public.record_upload_part_v1(
    'upload_cccccccccccccccccccccccc',
    encode(digest('secret-c', 'sha256'), 'hex'),
    2, '"etag-2"', 67108864, now()
  );
  perform public.record_upload_part_v1(
    'upload_cccccccccccccccccccccccc',
    encode(digest('secret-c', 'sha256'), 'hex'),
    3, '"etag-3"', 23068672, now()
  );
  perform public.record_upload_part_v1(
    'upload_cccccccccccccccccccccccc',
    encode(digest('secret-c', 'sha256'), 'hex'),
    3, '"etag-3"', 23068672, now()
  );

  perform public.complete_upload_reservation_v1(
    'upload_cccccccccccccccccccccccc',
    encode(digest('secret-c', 'sha256'), 'hex'), true, now()
  );
  perform public.complete_upload_reservation_v1(
    'upload_cccccccccccccccccccccccc',
    encode(digest('secret-c', 'sha256'), 'hex'), true, now()
  );

  select storage_used_bytes, reserved_storage_bytes, system_storage_bytes
  into used_bytes, reserved_bytes, system_bytes
  from public.weddings where id = 'wed_upload_contract';
  select count(*) into media_count
  from public.wedding_media
  where upload_reservation_id = 'upload_cccccccccccccccccccccccc';
  if used_bytes <> 209715200 or reserved_bytes <> 0 or media_count <> 1
    or system_bytes <> 12601 then
    raise exception 'Completion was not exactly once: used %, reserved %, system %, media %',
      used_bytes, reserved_bytes, system_bytes, media_count;
  end if;

  begin
    perform public.abort_upload_reservation_v1(
      'upload_cccccccccccccccccccccccc',
      encode(digest('secret-c', 'sha256'), 'hex'), now()
    );
  exception when others then
    if sqlerrm like '%Completed uploads cannot be cancelled%' then
      completed_abort_blocked := true;
    else
      raise;
    end if;
  end;
  if not completed_abort_blocked then
    raise exception 'Completed upload cancellation was not blocked.';
  end if;

  begin
    perform public.reserve_guest_upload_v1(
      p_id => 'upload_cccccccccccccccccccccccc',
      p_client_request_key_hash => encode(digest('request-c', 'sha256'), 'hex'),
      p_secret_hash => encode(digest('secret-c', 'sha256'), 'hex'),
      p_media_id => 'asset_444444444444444444444444',
      p_wedding_id => 'wed_upload_contract', p_mode => 'multipart',
      p_object_path => 'weddings/wed_upload_contract/guest/asset_444444444444444444444444-video.mp4',
      p_staging_object_path => 'weddings/wed_upload_contract/upload-staging/upload_cccccccccccccccccccccccc-video.mp4',
      p_kind => 'video', p_mime_type => 'video/mp4',
      p_file_name => 'video.mp4', p_byte_size => 157286400,
      p_part_size_bytes => 67108864, p_part_count => 3,
      p_thumbnail_path => 'weddings/wed_upload_contract/guest-thumbnail/asset_444444444444444444444444-thumb-video.jpg',
      p_thumbnail_staging_path => 'weddings/wed_upload_contract/upload-staging/upload_cccccccccccccccccccccccc-thumb-video.jpg',
      p_thumbnail_mime_type => 'image/jpeg',
      p_thumbnail_file_name => 'video-thumbnail.jpg',
      p_thumbnail_byte_size => 12345,
      p_guest_name => 'Guest C', p_note => 'Changed metadata', p_now => now()
    );
  exception when others then
    if sqlerrm like '%reused with different metadata%' then
      metadata_blocked := true;
    else
      raise;
    end if;
  end;
  if not metadata_blocked then
    raise exception 'Idempotency key metadata reuse was not blocked.';
  end if;
end
$contract$;

select json_build_object(
  'upload_contract', 'passed',
  'quota_oversubscription_blocked', true,
  'abort_and_expiry_exactly_once', true,
  'multipart_completion_exactly_once', true,
  'metadata_reuse_blocked', true
) as result;
