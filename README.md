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
- `/privacy` - localized customer privacy and data notice, including the Cloudflare Turnstile addendum
- `/admin` - private couple studio
- `/admin/mary-john` - local/demo admin studio
- `/admin/presentation` - authenticated full-screen Flow Mode
- `/admin/mary-john/presentation` - local/demo Flow Mode
- `/{coupleSlug}` - guest upload page
- `/mary-john?demo=1` - local/demo guest upload page
- `/owner` - Turkish-only owner cockpit for memberships, tokens, packages, cleanup, devices, and system status
- `/owner/upgrades` - legacy route; redirects to `/owner`

## Help and localization

Login, admin, demo, and guest upload screens include contextual Help dialogs.
All fixed UI copy, including Help content, is served from `src/lib/i18n.ts`
for `en`, `es`, `fr`, `de`, `pt`, and `zh`; unsupported browser languages
fall back to English.

The owner cockpit is intentionally Turkish-only because it is an internal
operator tool, not a customer-facing screen.

## Storage and plans

Production media storage uses Cloudflare R2 with private objects and presigned
PUT/GET URLs. Supabase stores metadata, quota, access windows, sessions, and
immutable entitlement records.

Current product model:

- Classic: 50 GB storage and 3 months of access from the wedding date.
- Premium Extension: adds 50 GB and 6 months from the current access end date.
- Guest uploads hard-stop when quota is full or access has expired.
- Expired files are not deleted immediately; they become cleanup candidates
  after the 30-day grace window.

Premium Extension is applied manually from `/owner` after finding the membership
by couple name. Customers copy only their couple name into Etsy personalization;
Studio Code and Etsy order number are no longer part of the customer flow. Every
application uses an idempotent operation key and an immutable entitlement event,
so an accidental retry cannot add the package twice.

### Secure upload flow

- A guest file can be at most 5 GiB; the membership quota starts at 50 GB.
- The server atomically reserves quota before returning any signed R2 target.
- Files up to 100 MiB use one short-lived staging upload. Larger files use
  64 MiB multipart chunks with at most three concurrent parts on mobile.
- Every reservation expires after 24 hours. The daily maintenance job releases
  stale quota and aborts/deletes unfinished R2 uploads.
- A completed staging object is promoted to a unique final object. Reusing an
  old signed staging URL cannot overwrite completed media.
- Cloudflare Turnstile is verified by the server before quota is reserved.
- Invisible Turnstile use is disclosed from login and guest screens through the six-language `/privacy` notice.
- Profile and thumbnail files do not consume the couple quota; they are tracked
  separately as system storage.

The retired `/api/uploads/[slug]`, `/prepare`, and `/complete` endpoints return
`410`. New uploads use the reservation endpoints under
`/api/uploads/[slug]/reservations` for prepare/resume/cancel, multipart part
signing, part completion, and final completion.

## Environment

Copy `.env.example` for the complete variable list. Never commit real values.
The required names are:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=say-yes-memories
NEXT_PUBLIC_ETSY_PREMIUM_UPGRADE_URL=
AUTH_PASSWORD_PEPPER=
AUTH_RATE_LIMIT_SECRET=
OWNER_SETUP_SECRET=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TURNSTILE_EXPECTED_HOSTNAMES=
CRON_SECRET=
```

Enable R2 in the Cloudflare dashboard before deploying, create the
`say-yes-memories` bucket, and keep it private. Browser uploads require exact
CORS origins, `PUT`, `Content-Type`, and an exposed `ETag` response header.
Configure an R2 lifecycle safety rule that aborts incomplete multipart uploads
after one day; do not add automatic expiry for completed customer files.

`AUTH_PASSWORD_PEPPER`, `AUTH_RATE_LIMIT_SECRET`, `OWNER_SETUP_SECRET`, and
`CRON_SECRET` must each contain at least 32 bytes. `OWNER_SETUP_SECRET` is only
for the one-time owner bootstrap and should be removed from Vercel after the
owner creates a password. `TURNSTILE_EXPECTED_HOSTNAMES` contains comma-separated
hostnames without schemes.

## Database migrations

Apply migrations in filename order. The product-ready tail is:

1. `20260711114338_product_ready_core.sql`
2. `20260711180000_add_auth_rate_limits.sql`
3. `20260711203000_add_owner_cockpit.sql`
4. `20260712120000_add_secure_multipart_uploads.sql`
5. `20260712143000_add_daily_maintenance.sql`
6. `20260712160000_add_presentation_media_index.sql`

The last migration supports the authenticated Vercel cron route at
`/api/cron/daily-maintenance`. It expires upload reservations, processes
owner-approved deletion jobs, finalizes safe cleanup, and records Supabase/R2
health. `vercel.json` schedules it daily; Vercel sends `CRON_SECRET` as a Bearer
credential.

## Verification notes

Before touching a real paid customer, test owner and upgrade behavior with a
temporary wedding record. The expected check is: one-time owner setup and login
work, couple-name search finds the temporary membership, Premium Extension adds
exactly 50 GB and 6 months, retrying the same operation key does not apply it a
second time, and the temporary records are removed after verification. Never run
a write-test against a real customer membership.

Use `docs/production-runbook.md` for the production cutover, rollback, R2,
Turnstile, migration, temporary-member, and final verification sequence.
