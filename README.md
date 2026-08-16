# LeetHabit

LeetHabit makes a daily LeetCode practice goal visible, persistent, and hard to forget. A completed problem is stored against the user’s configured local date; streaks, heatmaps, calendar history, milestones, and reminder cancellation all derive from that persisted data.

## Local development

Requires Node 22. Copy `.env.example` to `.env.local`, set long random `AUTH_SECRET` and `CRON_SECRET` values, then run:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`, create an account, and log a problem. SQLite is created automatically at `DATABASE_PATH` (default: `data/leethabit.sqlite`). The database uses durable tables and uniqueness constraints instead of in-memory state.

## Environment

`DATABASE_PATH`, `AUTH_SECRET`, and `CRON_SECRET` are required for deployment. `APP_URL` is the public HTTPS URL. Set the `META_WHATSAPP_*` variables to enable the Meta provider; when access token or phone-number ID is absent, LeetHabit deliberately stays in mock mode. `WHATSAPP_TEMPLATE_NAME` and `WHATSAPP_TEMPLATE_LANGUAGE` document the default provider configuration; per-user safe template settings are persisted in the database.

Never expose or commit these values. The browser only receives connection state, never provider credentials.

## Reminders and Render deployment

The app exposes a secure, idempotent cron endpoint at `GET /api/cron/reminders`. Configure a Render Cron Job to call it every five minutes with `Authorization: Bearer $CRON_SECRET`. The supplied `render.yaml` uses a persistent disk for SQLite and documents the intended web + cron topology. Set `APP_URL` and `CRON_SECRET` on both services in Render. For multi-region/high-concurrency production deployments, swap the SQLite connection for managed Postgres while retaining the same service boundaries and unique constraints.

The processor uses each user’s IANA timezone, start/cutoff window, and interval. It persists every attempt. A transaction creates the record before dispatch, and completed days cancel queued reminders, so reloads and duplicate cron invocations do not continue the day’s reminder cycle.

## Meta WhatsApp Cloud API

1. Create and approve the `leetcode_reminder` (`en_US`) template with one body variable.
2. Set `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, and optionally the business account ID.
3. Register `https://YOUR_APP/api/webhooks/whatsapp` in Meta, set `META_WHATSAPP_VERIFY_TOKEN`, and set `META_WHATSAPP_APP_SECRET` so webhook signatures are verified.
4. Subscribe to message status webhooks. Delivery callbacks are idempotently mapped onto the persisted provider message ID.

Transient provider errors become retryable attempts; permanent authentication/recipient errors are recorded as failed and are not retried indefinitely. Use Settings → Send test reminder to validate mock mode or the live connection.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
