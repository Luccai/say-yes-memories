alter table public.wedding_media
  add column if not exists thumbnail_id text,
  add column if not exists thumbnail_path text,
  add column if not exists thumbnail_mime_type text,
  add column if not exists thumbnail_file_name text,
  add column if not exists thumbnail_byte_size bigint check (
    thumbnail_byte_size is null or thumbnail_byte_size >= 0
  ),
  add column if not exists thumbnail_created_at timestamptz;
