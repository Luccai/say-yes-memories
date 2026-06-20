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

## Storage note

Current V1 uses a local file-backed development store in `.local-data/`.
The code keeps media storage behind a small adapter so production can later move
to Supabase Storage, Vercel Blob, or Cloudflare R2.
