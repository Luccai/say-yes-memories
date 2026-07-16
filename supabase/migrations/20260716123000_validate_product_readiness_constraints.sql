-- The hardening migration adds this check without scanning existing rows so it
-- can be deployed safely. Validate it separately after the preflight confirms
-- that no existing welcome note exceeds the server-side limit.

alter table public.weddings
  validate constraint weddings_welcome_note_length_check;
