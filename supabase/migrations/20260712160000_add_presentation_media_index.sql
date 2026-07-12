create index if not exists wedding_media_wedding_chronological_idx
  on public.wedding_media (wedding_id, created_at asc, id asc);
