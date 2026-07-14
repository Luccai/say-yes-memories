# Memory Archive Design

## Goal

Give each real couple one reliable way to retrieve every private memory as a
single ZIP archive. The archive is prepared outside Vercel, never counts
towards the couple's purchased storage quota, and is deleted 24 hours after it
is ready.

## Customer experience

The Private Storage panel shows a Memory archive card with:

- photo, video, voice-note counts and their combined source size;
- a `Download all memories` action;
- a calm queued/preparing state with files and bytes completed;
- a ready state with `Download ZIP` and its 24-hour expiry;
- clear retry text when preparation fails.

The demo never creates an archive. Its card explains that downloads are part of
the real studio and stays disabled.

## Archive contents

The archive uses safe, deterministic names and contains:

```
Photos/
Videos/
Voice Notes/
messages.csv
```

`messages.csv` records the original file name, folder, upload time, guest name
and note. Existing media snapshots are copied when a job starts, so the
archive's count and manifest cannot change while it is preparing.

## Architecture

1. A session-protected Next.js route atomically creates or reuses an archive
   job and its media snapshot in Supabase. A couple can have only one queued,
   running, or unexpired ready job.
2. The route starts a private Cloudflare archive-runner Worker using an
   HMAC-authenticated request. The Worker launches one specifically identified
   Cloudflare Container for the job.
3. The short-lived Node container streams source objects from private R2 into
   a multipart ZIP upload in a separate private R2 archive prefix. It uses
   store-only ZIP entries because phone photos and video are already
   compressed; this avoids wasting CPU and preserves a near-source-size
   estimate.
4. The container reports progress and completion to Vercel's internal routes
   with a callback credential derived for that individual attempt. A renewable
   lease permits a stalled attempt to be replaced while stale callbacks are rejected. The Worker never
   receives the root callback secret. The app keeps all Supabase access and
   customer-session authorization server-side.
5. A ready archive is downloaded through a session-protected Next.js route
   that issues a short-lived R2 redirect. The archive object remains available
   for 24 hours, but its R2 address is never exposed in client data.
6. Daily maintenance removes expired R2 archive objects and marks their jobs
   expired. Failed container jobs retain a short error code and can be retried
   by creating a fresh job.

## Security and limits

- Archive jobs and manifests are always scoped to the current wedding id.
- Client requests never choose R2 paths, media ids, archive paths or status.
- Dispatch and container callbacks authenticate with timestamped HMAC
  signatures; signatures expire quickly and compare in constant time.
- The container receives a one-job identifier and derived secret; a credential
  for one archive cannot read or update another job's snapshot.
- Callback origin is the server-controlled `ARCHIVE_APP_ORIGIN`, never an
  origin supplied by the browser request.
- Archive R2 credentials are separate Cloudflare secrets, not committed or
  exposed to Vercel clients.
- ZIP output uses R2 multipart upload and streams each source file; no process
  buffers the archive in memory or writes it to Vercel's ephemeral disk.

## Data and operations

New tables are `archive_jobs` and `archive_job_items`. The job stores counts,
source and output bytes, progress, state, expiry, and a safe error code. Items
store the immutable source manifest.

The archive lifecycle is `queued -> running -> ready -> expired`, with `failed`
available from queued/running. Repeated customer clicks reuse the active or
ready job instead of starting a second archive.

Cloudflare configuration and Docker image are source-controlled under
`workers/archive-runner/`. Secrets are set only with Wrangler and Vercel
environment settings. The production runbook documents R2 bindings, container
deployment, secret names, and a temporary-membership verification flow.

## Verification

- Unit tests prove folder assignment, CSV escaping, 24-hour expiry, and
  duplicate-request reuse.
- Route tests prove session isolation, job ownership, internal callback HMAC,
  and no R2 path leakage.
- The archive runner tests its manifest request, multipart output contract, and
  progress callback with mocked R2.
- A production-like verification uses a temporary wedding and a separate R2
  prefix only; no real customer media is read or written during testing.
