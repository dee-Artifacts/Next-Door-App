# Deployment Guide

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (safe for the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server side only, store as Sensitive) |
| `NEXT_PUBLIC_APP_URL` | App URL, for example `https://nextdoor.deeproduct.org` |
| `ADMIN_EMAIL` | The Google email that becomes admin on first sign in |
| `RESEND_API_KEY` | Resend API key for the email digest (store as Sensitive) |
| `CRON_WEBHOOK_SECRET` | Shared secret for cron-job.org webhook authentication (store as Sensitive) |

On Vercel, mark the three secret values (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_WEBHOOK_SECRET`) as **Sensitive** so they cannot be read back from the dashboard.

## Supabase: required setup

Run these once in the Supabase SQL Editor:

1. `supabase/schema.sql` to create all tables.
2. `supabase/add-guest-support.sql` to enable Guest Access.
3. The settings seed below.

```sql
INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('email_notifications_enabled', '1'),
  ('email_send_days', '["monday"]'),
  ('email_send_time', '09:00'),
  ('email_last_sent', '')
ON CONFLICT (setting_key) DO NOTHING;
```

Then, under Authentication:

- Enable the **Google** provider and add your OAuth Client ID and Secret.
- Enable **Anonymous sign ins** so Guest Access works.
- Add your app URL to the Redirect URLs list.

## cron-job.org setup

Create **3 jobs** at https://cron-job.org. Each job sends the header `x-webhook-secret: <CRON_WEBHOOK_SECRET value>`.

### Job 1: Cleanup (events and announcements)

| Field | Value |
|---|---|
| URL | `https://nextdoor.deeproduct.org/api/cron/cleanup` |
| Schedule | Once a month, e.g. the 7th at 02:00 (`0 2 7 * *`) |
| Method | POST |

Handles:
- Deletes events that ended more than 24 hours ago, archiving them to event history.
- Expires stale announcements where `announcement_expires_at < NOW()`.

The app hides events itself 24 hours after they end, so this job only reclaims
space and can run rarely. It works in batches for up to ~20 seconds and is safe
to re-run; if the response says `"done": false`, run it again (or schedule a few
runs ten minutes apart on the same day, e.g. `0,10,20 2 7 * *`).

### Job 2: Email digest

| Field | Value |
|---|---|
| URL | `https://nextdoor.deeproduct.org/api/cron` |
| Schedule | Every 15 minutes |
| Method | POST |

The handler runs a smart schedule check, so it only sends when the current UK day and time match the configured schedule and the email has not already gone out today.

Configure the schedule in Admin Settings, Email Notifications, Send Schedule.

### Job 3: Purge guests (anonymous accounts)

| Field | Value |
|---|---|
| URL | `https://nextdoor.deeproduct.org/api/cron/purge-guests` |
| Schedule | Once a month, e.g. the 7th at 02:00 (`0 2 7 * *`) |
| Method | POST |

Deletes Guest Access accounts older than `GUEST_TTL_HOURS` (default `24`): their content, their `users` row, and the underlying anonymous auth user, which frees Supabase MAU. A healthy response looks like `{"success":true,"done":true,"purged":N,"ttl_hours":24}`. Like cleanup, it works in batches and is safe to re-run when `done` is `false`.

## Vercel

`vercel.json` has an empty crons array, so all scheduling is handled by cron-job.org.
