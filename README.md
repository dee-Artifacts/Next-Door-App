<div align="center">
  <img width="96" src="public/icon.svg" alt="Next Door logo" />

  # Next Door

  **A private community app for your building, block, or neighbourhood.**

  [![Version](https://img.shields.io/badge/version-Product%20Demo-10B981)](https://nextdoor.deeproduct.org)
  [![Live Demo](https://img.shields.io/badge/Live%20Demo-nextdoor.deeproduct.org-10B981?logo=vercel&logoColor=white)](https://nextdoor.deeproduct.org)
  [![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
  [![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase)](https://supabase.com/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
  [![License](https://img.shields.io/badge/license-MIT-orange)](LICENSE)

</div>

---

## What is Next Door?

Next Door is a small, private community app you can run for the people right around you: an apartment building, a single street, or a local group. It gives a neighbourhood one calm place to chat, plan events, and pass things along to each other, without ads, tracking, or a giant public social network in the middle.

You host your own copy. The data lives in your own database. Members sign in with Google, and the first admin decides who gets in.

> **Heads up:** this repository is currently a **Product Demo**. The live site is a working demonstration with sample data that resets from time to time, so feel free to click around and break things.

---

## Try the live demo

Visit **[nextdoor.deeproduct.org](https://nextdoor.deeproduct.org)** and pick either option:

- **Guest Access** drops you straight into the app as a temporary visitor. No account, no Google, nothing to fill in. Guest sessions are cleared automatically.
- **Sign in with Google** gives you a full member account with a profile.

Because it is a shared demo, the data is wiped on a schedule. Anything you post is temporary by design.

---

## A look inside

**Live group chat with an event pinned alongside it**

<img src="public/Github-showcase-1.png" alt="Group chat with an event detail panel" />

**Events, with your own events grouped together**

<img src="public/Github-showcase-2.png" alt="Events screen showing My Events" />

**Marketplace requests, for when you need to borrow or find something**

<img src="public/Github-showcase-3.png" alt="Posting a new marketplace request" />

**Notifications kept in one tidy panel**

<img src="public/Github-showcase-4.png" alt="Chat with the notifications panel open" />

**Built to feel right on a phone too**

<img width="320" src="public/Github-showcase-5.png" alt="Mobile view of chat and an event" />

---

## Features

### Chat
- Real time group chat with a live message feed
- Emoji reactions on any message
- Threaded replies with quoted context
- Photo and document attachments inline
- @mentions with autocomplete that notify the person mentioned
- Edit or delete your own messages
- Pinned messages and time bound announcements that expire on their own
- Typing indicators and per message read receipts
- Full text search across the whole history
- Unread count shown in the browser tab

### Events
- Create an event with a title, description, location, start and end time, capacity, and a cover image
- RSVP to join or leave, with the member cap enforced
- Every event gets its own chat room
- Past events are archived for you automatically

### Marketplace
- Post items as offering or requesting, set as Sale, Rent, or Free
- Attach a gallery of photos to a listing
- Neighbours tap Interested to queue up, and the poster picks who gets it
- A private chat thread for each listing to sort out the details
- A clear status flow from Open to Discussion to Confirmed to Closed
- Rental periods and return confirmation for borrowed items

### Profiles and access
- **Guest Access** for instant, account free visits
- **Google sign in** for full members, no password to remember
- Profile setup with room number, display name, avatar, and a short bio
- A friendly set of preset avatars to choose from
- Public profile pages and a real time online indicator

### Admin
- Approve, deactivate, or remove members
- A configurable weekly email digest sent through [Resend](https://resend.com/)
- Broadcast reminders to everyone
- Export the member list as CSV
- Clear chat history when you need a reset

### Privacy by default
- Self hosted on your own infrastructure
- No ads, no recommendation feeds, no behavioural tracking
- Cookies are used only to keep you signed in
- Privacy Policy, Terms, and Cookie Policy pages included

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database and Auth | Supabase (Postgres, Realtime, Storage) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Email | Resend |
| Scheduling | cron-job.org (webhook based) |
| Deployment | Vercel |

---

## Run your own

### Prerequisites

- Node.js 20 or newer
- A [Supabase](https://supabase.com/) project (the free tier is plenty)
- A [Vercel](https://vercel.com/) account (free tier works)
- A [Resend](https://resend.com/) account for email (optional, free tier works)
- A Google Cloud project with OAuth 2.0 credentials

### 1. Clone and install

```sh
git clone https://github.com/deepakkrishnar1618-svg/Next-Door-App.git
cd Next-Door-App
npm install
```

### 2. Set up Supabase

1. Create a new Supabase project.
2. Open the SQL Editor and run `supabase/schema.sql` to create every table.
3. Run `supabase/add-guest-support.sql` to enable Guest Access (it adds the `is_guest` column).
4. Seed the default settings:

```sql
INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('email_notifications_enabled', '1'),
  ('email_send_days', '["monday"]'),
  ('email_send_time', '09:00'),
  ('email_last_sent', '')
ON CONFLICT (setting_key) DO NOTHING;
```

5. In Authentication, Providers, enable **Google** and paste in your Google OAuth Client ID and Secret.
6. To allow Guest Access, enable **Anonymous sign ins** under Authentication, Sign In / Providers.
7. Add your app URL under Authentication, URL Configuration, Redirect URLs.

### 3. Configure Google OAuth

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), APIs and Services, Credentials.
2. Create an OAuth 2.0 Client ID for a Web application.
3. Add your Supabase callback as an authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.

### 4. Environment variables

Copy the example file and fill in your values:

```sh
cp .env.example .env.local
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase, Settings, API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase, Settings, API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, Settings, API (keep this secret, server only) |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL |
| `ADMIN_EMAIL` | The Google email that becomes admin on first sign in |
| `RESEND_API_KEY` | Resend, API Keys |
| `CRON_WEBHOOK_SECRET` | Any long random string, used to authenticate cron webhooks |

When you deploy to Vercel, store the three secret values (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_WEBHOOK_SECRET`) as **Sensitive** environment variables.

### 5. Deploy to Vercel

```sh
npx vercel
```

Or connect the repository in the Vercel dashboard and add the environment variables there.

### 6. Set up the cron jobs (optional)

These keep the app tidy. Create three jobs at [cron-job.org](https://cron-job.org), each sending the header `x-webhook-secret: <your CRON_WEBHOOK_SECRET>`:

| Job | URL | Schedule | Method |
|---|---|---|---|
| Cleanup | `https://your-domain.com/api/cron/cleanup` | Once a month (re-run if `done` is `false`) | POST |
| Email digest | `https://your-domain.com/api/cron` | Every 15 min | POST |
| Purge guests | `https://your-domain.com/api/cron/purge-guests` | Once a month (re-run if `done` is `false`) | POST |

The email digest handler checks the admin schedule internally, so running it every 15 minutes is safe. Purge guests removes Guest Access accounts older than `GUEST_TTL_HOURS` (default 24).

---

## Local development

```sh
npm run dev
```

The app runs at `http://localhost:3000`. You will need a Supabase project and a `.env.local` with real credentials.

---

## First sign in

1. Open the app and click **Sign in with Google**.
2. Use the email you set as `ADMIN_EMAIL`.
3. Complete the profile setup (name and room number).
4. You land in the main chat as an admin. Open Settings to configure the app.

---

## Project status

This is the **Product Demo** release. It is feature complete for a single neighbourhood and runs as a live demonstration at [nextdoor.deeproduct.org](https://nextdoor.deeproduct.org). Sample data resets periodically.

---

## License

MIT. See [LICENSE](LICENSE).
