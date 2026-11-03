# HaveContact

Privacy-first, community-powered phone number intelligence.

## Status
- Step 1: React + TypeScript + Vite foundation.
- Step 2: Responsive dark-first landing page and interactive search results.
- Step 3: Cloudflare Worker API and initial D1 migration.
- Lookup returns aggregate approved community reports only. It never identifies a private person.
- Report submission requires Turnstile verification and is queued for moderation.

## Stack
React 19, TypeScript, Vite 8, Tailwind CSS, Cloudflare Workers, D1, Wrangler.

## Requirements
Node.js 20.19+ or 22.12+.

## Local frontend
```bash
npm install
npm run dev
```

## Local API
1. Create a D1 database and update `database_id` in `wrangler.toml`.
2. Apply all numbered migrations: `npm run db:local`.
3. Set local secrets in `.dev.vars` (never commit it):
   ```
   PHONE_HASH_SECRET=replace-with-long-random-secret
   TURNSTILE_SECRET=your-turnstile-secret
   ADMIN_API_TOKEN=long-random-admin-token
   ```
4. Start API: `npm run api:dev`.
5. Set `VITE_API_BASE_URL=http://localhost:8787` in local `.env`.

## Production setup

The Worker has a separate `production` environment. Always use the `--env production` commands below for production secrets, migrations, and deployment.

1. The production D1 database is already provisioned as `havecontact-db`; its ID is configured in both bindings in `wrangler.toml`.
2. Configure a Turnstile widget for the frontend hostname. Keep its site key for the frontend and its secret key for the Worker.
3. Set production Worker secrets:
   ```bash
   npx wrangler secret put PHONE_HASH_SECRET --env production
   npx wrangler secret put TURNSTILE_SECRET --env production
   npx wrangler secret put ADMIN_API_TOKEN --env production
   ```
   Generate independent random values. `PHONE_HASH_SECRET` and `ADMIN_API_TOKEN` must each contain at least 32 characters.
4. In the Cloudflare dashboard, open the production Worker environment's **Settings > Variables and Secrets** and set `ALLOWED_ORIGINS` to the exact HTTPS frontend origin(s), comma-separated, with no wildcard, path, or trailing slash. Example: `https://havecontact.pages.dev`.
5. Apply production migrations: `npm run db:remote`.
6. Run a deployment bundle check: `npm run deploy:api:dry-run`.
7. Deploy the API: `npm run deploy:api`.
8. Set frontend build variables `VITE_API_BASE_URL` and `VITE_TURNSTILE_SITE_KEY`, then deploy the static frontend.
9. Verify `GET https://YOUR_WORKER_DOMAIN/api/ready` returns HTTP 200 and `{"ok":true,"ready":true}` before testing user flows.

The production Worker fails closed unless D1, all three secrets, and a non-empty HTTPS-only exact-origin allowlist are configured. `/api/health` is a liveness endpoint; use `/api/ready` for deployment readiness. Never expose `ADMIN_API_TOKEN` or any Worker secret through a `VITE_*` variable.

### GitHub Actions production deployment

The repository includes a manual deployment workflow at `.github/workflows/deploy.yml`. To prepare it:

1. In GitHub, open **Settings > Environments** and create an environment named `production`. The deployment workflow creates the Pages project automatically if it does not exist.
3. Add these environment **secrets**:
   - `CLOUDFLARE_API_TOKEN` (Cloudflare token with Workers Scripts Edit, D1 Edit, Pages Edit, and Account Settings Read permissions)
   - `CLOUDFLARE_ACCOUNT_ID`
   - `PHONE_HASH_SECRET` (at least 32 random characters)
   - `TURNSTILE_SECRET`
   - `ADMIN_API_TOKEN` (at least 32 random characters)
4. Add these environment **variables**:
   - `WORKER_BASE_URL` (Worker HTTPS origin, no trailing slash; with the current config this is `https://havecontact-api-production.mujib.workers.dev`)
   - `FRONTEND_URL` (Pages HTTPS origin, no trailing slash; expected `https://havecontact.pages.dev`)
   - `PAGES_PROJECT_NAME` (use `havecontact`)
   - `ALLOWED_ORIGINS` (must exactly match `FRONTEND_URL`)
   - `VITE_TURNSTILE_SITE_KEY`
5. Confirm the production D1 ID is filled in both production and top-level bindings in `wrangler.toml`.
6. Run **Actions > Deploy HaveContact to Cloudflare > Run workflow**.

The workflow runs dependency audit, typechecks, tests, applies D1 migrations, updates Worker secrets, deploys the API, checks `/api/ready`, builds the frontend, deploys Pages, and verifies the frontend response. It is manual-only; pushes to `main` do not deploy automatically. `ALLOWED_ORIGINS` is stored as a Worker secret by this workflow so it can be updated in the same controlled deployment.

## API
- `GET /api/health` (liveness)
- `GET /api/ready` (production readiness; HTTP 200 only when required production configuration is valid)
- `GET /api/v1/lookup?phone=+62812...` (approved community signals, opt-in public names, and manually reviewed business profiles)
- `POST /api/v1/identity-claims` (Turnstile required; submit your own public display name, phone, proof URL, and explicit public-display consent)
- `GET /api/admin/identity-claims?status=pending` and `POST /api/admin/identity-claims/:id/moderate` (admin bearer authentication)\n- `POST /api/v1/business-claims` (Turnstile required; submit a business name, number, official HTTPS website, and public proof URL for manual review)\n- `GET /api/admin/business-claims?status=pending` and `POST /api/admin/business-claims/:id/moderate` (admin bearer authentication)
- `POST /api/v1/reports` (Turnstile required; body: phone, category, description; returns a report reference ID)
- `POST /api/v1/reports/remove` (body: referenceId; permanently removes the report, moderation history, and orphaned phone hash)
- `GET /api/admin/reports?status=pending` (admin bearer authentication; statuses: pending, approved, rejected; max 100)
- `GET /api/admin/feedback?status=pending` and `POST /api/admin/feedback/:id/resolve` (admin bearer authentication; review private correction/abuse requests)
- `POST /api/admin/reports/:id/moderate` (admin bearer authentication; approve or reject a pending report; rejection requires a 5-500 character reason)

## Privacy and safety
- Phone numbers are normalized and HMAC-indexed; raw numbers are not stored in D1.
- Report descriptions are private while pending. Public lookup exposes only approved aggregate categories and counts.
- No automatic contact-book uploads or non-consensual identity lookup. Public personal names are shown only after the number user opts in, submits a public proof URL, and a moderator approves the claim.\n- Personal identity claims are opt-in and require explicit public-display consent; pending/rejected claims are retained up to 90 days and approved public identity records up to 365 days after approval. Moderators must confirm that the submitted public page directly links the display name and phone number. This is not legal identity verification.\n- Business profiles are opt-in. A claim is private while pending and appears in lookup only after manual review confirms that an official public source directly links the business to the claimed phone number. A submitted website alone is not sufficient evidence. This review is a platform verification signal, not a legal identity check. Pending/rejected claims are retained for up to 90 days; approved claims and their evidence are retained for up to 365 days after approval.
- Reports require moderation. Visitors can privately submit correction or abuse feedback for a phone number; feedback is never exposed in public lookup and requires admin review. Authors can remove a submitted report using its reference ID; removal also deletes its moderation history and orphaned phone hash.
- A report reference ID is a bearer credential: anyone who possesses it can remove that report. It is shown once after submission, should be stored privately, and is rate-limited to 3 removal attempts per IP per hour. This flow proves possession of the reference, not legal identity or ownership of the phone number.
- Configure the production HTTPS CORS allowlist, all three Worker secrets, rate limiting, and retention controls before production.
- GET query strings may be present in infrastructure logs; review logging and retention before production.

## Verification
```bash
npm run typecheck
npm run build
```

## License
MIT - see LICENSE.


## Recent implementation notes

- Phone metadata uses `libphonenumber-js` numbering-plan data. It reports country/region and number type where the numbering plan can determine them; it does not identify a subscriber.
- Migration `0002_request_limits.sql` creates privacy-preserving hashed rate-limit buckets; migration `0003_moderation_reason.sql` adds moderation audit reasons; migration `0004_query_indexes.sql` adds indexes for moderation queue and audit lookups.
- Configure `ALLOWED_ORIGINS` as a comma-separated list of exact production frontend origins in Worker variables. Do not use a wildcard in production.
- Admin dashboard: open `/admin` on the frontend and enter the server-side `ADMIN_API_TOKEN`. The token stays in page memory and must never be configured as a `VITE_*` variable.
- The dashboard and report form require the deployed API, D1 migrations, Turnstile site/secret keys, and allowed-origin configuration before they can operate end-to-end.


## Security and deployment checklist

1. Create the Cloudflare D1 database and replace the placeholder database ID in `wrangler.toml`.
2. Apply all numbered migrations, including `0002_request_limits.sql`, `0003_moderation_reason.sql`, and `0004_query_indexes.sql`, using `npm run db:remote` (targets the explicit production environment).
3. Set Worker secrets: `PHONE_HASH_SECRET`, `TURNSTILE_SECRET`, and `ADMIN_API_TOKEN`.
4. Set the Worker variable `ALLOWED_ORIGINS` to the exact deployed frontend origin(s), comma-separated. The API intentionally does not send wildcard CORS permission.
5. Set frontend build variables `VITE_API_BASE_URL` and `VITE_TURNSTILE_SITE_KEY`.
6. Build and deploy the frontend and Worker. Test health, lookup, report submission, and moderation with a non-production test number before public launch.

Rate limiting uses HMAC-derived request buckets rather than storing raw client IP addresses. It is a baseline safeguard, not a substitute for Cloudflare WAF or managed rate limiting on a public launch. Lookup is limited to 40 requests per IP per minute, report submission to 5 per IP per hour and 3 per normalized phone number per 24 hours, and admin API traffic to 20 requests per IP per minute. Report creation, moderation status/audit writes, and report removal use D1 batches so related database changes commit or roll back together.


## Automated checks

Run `npm test` for phone-number normalization, numbering metadata, bounded JSON parsing, report-description validation, and atomic D1 write orchestration tests. CI runs frontend and Cloudflare Worker typechecks, tests, local D1 migration validation, a production Worker bundle dry-run, and production frontend build on pushes and pull requests.


## Moderation audit

- Migration `0003_moderation_reason.sql` adds a moderation reason to reports and the audit log.
- Rejection requires a concise reason (5-500 characters). Approval may include an optional note.
- Reasons are visible only in the authenticated admin dashboard and are never returned by public lookup.


## Operational data retention

- A daily Cloudflare Cron Trigger runs at 03:17 UTC.
- Pending and rejected reports expire after 30 days; approved reports expire after 180 days.
- Moderation audit records expire after 365 days; records attached to an expired report are removed first.
- Orphaned phone hashes, expired HMAC rate-limit buckets older than 7 days, and abuse-event records older than 90 days are pruned automatically.
- Retention is enforced by the daily scheduled Worker cleanup. Users can also remove a report immediately using its private reference ID; possession of that ID is the authorization mechanism, not legal identity verification.


### Production secret requirements

When `APP_ENV=production`, the Worker fails closed unless D1 is bound, `PHONE_HASH_SECRET` and `ADMIN_API_TOKEN` are each at least 32 characters, `TURNSTILE_SECRET` is present, and `ALLOWED_ORIGINS` contains at least one exact HTTPS origin. Wildcards, HTTP origins, and origin paths are rejected. Use independently generated random secrets; do not reuse credentials.
