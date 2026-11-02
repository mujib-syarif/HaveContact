# HaveContact

Privacy-first, community-powered phone number intelligence.

## Status
- Step 1: React + TypeScript + Vite foundation.
- Step 2: Responsive dark-first landing page and interactive search results.
- Step 3: Cloudflare Worker API and initial D1 migration.
- Lookup returns aggregate approved community reports only. It never identifies a private person.
- Report submission requires Turnstile verification and is queued for moderation.

## Stack
React 18, TypeScript, Vite, Tailwind CSS, Cloudflare Workers, D1, Wrangler.

## Requirements
Node.js 20.19+ or 22.12+.

## Local frontend
```bash
npm install
npm run dev
```

## Local API
1. Create a D1 database and update `database_id` in `wrangler.toml`.
2. Apply schema: `npm run db:local`.
3. Set local secrets in `.dev.vars` (never commit it):
   ```
   PHONE_HASH_SECRET=replace-with-long-random-secret
   TURNSTILE_SECRET=your-turnstile-secret
ADMIN_API_TOKEN=long-random-admin-token
   ```
4. Start API: `npm run api:dev`.
5. Set `VITE_API_BASE_URL=http://localhost:8787` in local `.env`.

## Production setup
- Create D1: `npx wrangler d1 create havecontact-db`.
- Replace the placeholder database ID in `wrangler.toml`.
- Set secrets with `npx wrangler secret put PHONE_HASH_SECRET` and `npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put ADMIN_API_TOKEN`.
- Configure a Turnstile widget and set `VITE_TURNSTILE_SITE_KEY` in the frontend build environment. The report form renders the challenge when this key is present.
- Apply migration: `npm run db:remote`.
- Deploy API: `npx wrangler deploy`.
- Configure frontend API base URL and deploy the static site.

## API
- `GET /api/health`
- `GET /api/v1/lookup?phone=+62812...`
- `POST /api/v1/reports` (Turnstile required; body: phone, category, description)
- `GET /api/admin/reports?status=pending` (admin bearer authentication; statuses: pending, approved, rejected; max 100)
- `POST /api/admin/reports/:id/moderate` (admin bearer authentication; approve or reject a pending report)

## Privacy and safety
- Phone numbers are normalized and HMAC-indexed; raw numbers are not stored in D1.
- Report descriptions are private while pending. Public lookup exposes only approved aggregate categories and counts.
- No automatic contact-book uploads, reverse identity claims, or public personal-name tags.
- Reports require moderation; provide correction/deletion workflows before public launch.
- Configure a strict CORS allowlist, rate limiting, retention controls, and admin authentication before production.
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
- Apply migration `0002_request_limits.sql` to create privacy-preserving hashed rate-limit buckets.
- Configure `ALLOWED_ORIGINS` as a comma-separated list of exact production frontend origins in Worker variables. Do not use a wildcard in production.
- Admin dashboard: open `/admin` on the frontend and enter the server-side `ADMIN_API_TOKEN`. The token stays in page memory and must never be configured as a `VITE_*` variable.
- The dashboard and report form require the deployed API, D1 migrations, Turnstile site/secret keys, and allowed-origin configuration before they can operate end-to-end.
