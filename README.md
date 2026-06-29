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

Production media storage uses Cloudflare R2 with private objects and presigned
PUT/GET URLs. Supabase stores metadata, quota, access windows, sessions, and
upgrade logs.

Required R2 environment variables:

```bash
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=say-yes-memories
NEXT_PUBLIC_ETSY_PREMIUM_UPGRADE_URL=
OWNER_ADMIN_PASSWORD=
```

Enable R2 in the Cloudflare dashboard before deploying, create the
`say-yes-memories` bucket, keep it private, and configure CORS for local and
production origins.
