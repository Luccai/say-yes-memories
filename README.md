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
- `/admin/mary-john` - local/demo admin studio
- `/{coupleSlug}` - guest upload page
- `/mary-john?demo=1` - local/demo guest upload page
- `/owner/upgrades` - owner-only manual Premium Extension panel

## Help and localization

Login, admin, demo, and guest upload screens include contextual Help dialogs.
All fixed UI copy, including Help content, is served from `src/lib/i18n.ts`
for `en`, `es`, `fr`, `de`, `pt`, and `zh`; unsupported browser languages
fall back to English.

The owner upgrade panel is intentionally Turkish-only because it is an internal
operator tool, not a customer-facing screen.

## Storage and plans

Production media storage uses Cloudflare R2 with private objects and presigned
PUT/GET URLs. Supabase stores metadata, quota, access windows, sessions, and
upgrade logs.

Current product model:

- Classic: 50 GB storage and 3 months of access from the wedding date.
- Premium Extension: adds 50 GB and 6 months from the current access end date.
- Guest uploads hard-stop when quota is full or access has expired.
- Expired files are not deleted immediately; they become cleanup candidates
  after the 30-day grace window.

Premium Extension is applied manually from `/owner/upgrades` with the couple's
Studio Code and Etsy order number. The Etsy order number is required to prevent
applying the same paid upgrade twice.

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

## Verification notes

Before touching a real paid customer, test upgrade behavior with a temporary
wedding record. The expected check is: owner login works, Studio Code lookup
finds the gallery, applying Premium Extension changes the temp record to 100 GB
and adds one upgrade log, and a second apply with the same Etsy order number is
rejected.
