-- Run after secure_upload_contract.sql in the same rollback-only transaction.
do $maintenance_contract$
declare
  reservation public.upload_reservations;
  job public.media_deletion_jobs;
  claimed_count integer;
begin
  reservation := public.mark_upload_storage_cleanup_v1(
    'upload_aaaaaaaaaaaaaaaaaaaaaaaa', true, null, now()
  );
  reservation := public.mark_upload_storage_cleanup_v1(
    'upload_aaaaaaaaaaaaaaaaaaaaaaaa', true, null, now()
  );
  if reservation.storage_cleaned_at is null
    or reservation.storage_cleanup_attempts <> 1 then
    raise exception 'Reservation storage cleanup was not idempotent.';
  end if;

  insert into public.media_deletion_jobs (
    id, wedding_id, media_id, object_path, thumbnail_path, status,
    attempts, created_at
  ) values (
    'del_maintenance_contract', 'wed_upload_contract',
    'asset_maintenance_contract',
    'weddings/wed_upload_contract/guest/maintenance.jpg',
    null, 'pending', 0, now()
  );

  select count(*) into claimed_count
  from public.claim_media_deletion_jobs_v1(10, now());
  if claimed_count <> 1 then
    raise exception 'Pending deletion job was not claimed exactly once.';
  end if;

  select count(*) into claimed_count
  from public.claim_media_deletion_jobs_v1(10, now());
  if claimed_count <> 0 then
    raise exception 'Processing deletion job was claimed concurrently.';
  end if;

  job := public.finish_media_deletion_job_v1(
    'del_maintenance_contract', false, 'temporary failure', now()
  );
  if job.status <> 'failed' or job.attempts <> 1 then
    raise exception 'Failed deletion job was not recorded.';
  end if;

  select * into job
  from public.claim_media_deletion_jobs_v1(10, now());
  if job.status <> 'processing' or job.attempts <> 2 then
    raise exception 'Failed deletion job could not be retried.';
  end if;

  job := public.finish_media_deletion_job_v1(
    'del_maintenance_contract', true, null, now()
  );
  job := public.finish_media_deletion_job_v1(
    'del_maintenance_contract', true, null, now()
  );
  if job.status <> 'completed' or job.attempts <> 2
    or job.processed_at is null then
    raise exception 'Deletion completion was not idempotent.';
  end if;
end
$maintenance_contract$;

select json_build_object(
  'maintenance_contract', 'passed',
  'storage_cleanup_idempotent', true,
  'deletion_claim_exclusive', true,
  'deletion_retry_durable', true,
  'deletion_completion_idempotent', true
) as result;
