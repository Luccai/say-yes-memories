# Say Yes Digital Memories

Private QR wedding memory studio for Etsy couples.

## Local setup

```bash
bun install
bun run prepare-hooks
bun run tokens:generate
bun run dev
```

The local demo token is `SAYYES-DEMO-2026` when no generated token seed exists.
Generated raw tokens are written under `private/` and must never be committed.

## Routes

- `/login` - couple token activation and returning-device entry
- `/admin` - private couple studio
- `/{coupleSlug}` - guest upload page

## Help and localization

Login, admin, demo, and guest upload screens include contextual Help dialogs.
All fixed UI copy, including Help content, is served from `src/lib/i18n.ts`
for `en`, `es`, `fr`, `de`, `pt`, and `zh`; unsupported browser languages
fall back to English.

## Storage note

Current V1 uses a local file-backed development store in `.local-data/`.
The code keeps media storage behind a small adapter so production can later move
to Supabase Storage, Vercel Blob, or Cloudflare R2.
