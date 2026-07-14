# Memory Archive Implementation Plan

1. Add archive job/item migration, service-role store helpers, 24-hour expiry
   cleanup, and tests for idempotent job creation and manifest integrity.
2. Add customer archive routes: status/start, secure ZIP redirect, and private
   runner manifest/progress/completion callbacks with HMAC checks.
3. Add the Cloudflare Worker + Container source, Docker image, multipart ZIP
   streamer, official Cloudflare runtime types, and runner unit tests.
4. Add the Private Storage archive card, six-language copy, demo-disabled
   state, polling/progress, and UI tests.
5. Update README, AGENTS and production runbook with required Cloudflare and
   Vercel secrets, deployment order, 24-hour cleanup, and temporary-wedding
   verification.
6. Run targeted unit/route/UI tests, build the Next app, validate Wrangler
   configuration, and keep deployment separate from real customer data.
