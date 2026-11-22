# Handoff: שכנות למען שכנות · Neighbors for Neighbors

Status as of 2026-11-22. Repo `mosesar9319/Neither-Meal-Helper`, branch
`claude/neighborly-meal-circle-redesign-ncgqq2`. Everything is committed and pushed; no pull request is open.

## What it is

A Hebrew-first (RTL) web app, with English, for organizing meals for a family after a birth, during illness,
or in hard times. An organizer sends a **meal request**; a **site admin approves** it; the organizer shares the
board link (usually in a WhatsApp group); neighbors pick a meal to cook and get an **email reminder the evening
before**. No user accounts except for admins. Light purple theme, light/dark following the system.

It rebuilds an earlier Lovable app (`neighborly-meal-circle.lovable.app`) with a new design and more features.

## Current state at a glance

| Area | State |
| --- | --- |
| App code | Done and tested (unit, SQL, browser) |
| Database (Supabase) | Live; 3 migrations applied |
| Email functions | 5 deployed and reachable; **send nothing** until Resend secrets exist |
| Reminder schedule | Live (pg_cron, daily 16:07 UTC) |
| Admins | 2 emails in `meal_admins`; neither has signed in yet |
| Hosting | **Not deployed.** Netlify connector was never usable in the previous session |
| Admin sign-in email | **Likely blocked** until Supabase Auth uses custom SMTP (see open items) |

## Your first tasks (in order)

1. **Deploy the site** (Netlify or any static host).
   - Build `npm run build`, publish `dist/`. `public/_redirects` already sends all paths to `index.html` on Netlify.
   - Environment variables (`.env` is git-ignored, so set them on the host):
     - `VITE_SUPABASE_URL=https://vipbambqmpjftdzouwsi.supabase.co`
     - `VITE_SUPABASE_ANON_KEY=` the project's **publishable** key (`sb_publishable_…`). The owner has it;
       it's also in Supabase → Project Settings → API. It is safe in the browser by design.
     - `VITE_EMAIL_ENABLED=true` only after step 2.
   - Check: open `/`, send a test request, confirm `/b/<slug>` shows "not found" while pending, then delete the test.
2. **Turn on email** (needs the owner): a Resend account and a verified sender. Set Edge Function secrets
   `MEAL_RESEND_API_KEY`, `MEAL_EMAIL_FROM` (e.g. `שכנות למען שכנות <meals@their-domain>`), and
   `MEAL_SITE_URL` (the deployed address, no trailing slash). Never put these in `VITE_*` variables.
3. **Make admin sign-in work** (owner, in the Supabase dashboard):
   - Authentication → SMTP: send through Resend's SMTP. Supabase's built-in mailer is heavily rate-limited and,
     as far as we know, only delivers to members of the Supabase organization, so the admins' sign-in links
     probably won't arrive without this. Not verified.
   - Authentication → URL Configuration → Redirect URLs: add `<site>/admin`. Otherwise sign-in links go to the
     project's default Site URL, which belongs to the other app.
   - The Auth email templates are shared with the other app (see "Shared project").
4. Then do a full live check: request → admin approves at `/admin` → organizer email → neighbor signs up →
   confirmation email → reminder the evening before.

## Shared Supabase project (read before touching the database)

- Project `vipbambqmpjftdzouwsi`, named **"signature-filings"**, region us-east-1, free plan. It also hosts an
  unrelated orders app (`customers`, `orders`, `order_items`, `admin_users`, `contact_messages`). The free plan's
  2-project limit forced the sharing. **Don't touch the other app's tables, functions, policies or Auth settings
  beyond what the meal app needs.**
- Everything for this app is prefixed: tables `meal_*`, browser functions `public.meal_*`, helpers in the
  `meal_private` schema, Edge Functions `meal-*`, secrets `MEAL_*`, cron job `meal-send-reminders`.
- Supabase Auth (users, SMTP, templates, redirect URLs) is shared. A meal admin's Auth account can't see the other
  app's data: every policy there requires its own `admin_users` row (checked 2026-11-22).
- The free project pauses after about a week without activity, which takes both apps down.
- The security advisor flags the `meal_*` functions as callable without signing in and the `meal_*` tables as
  "RLS enabled, no policy". Both are deliberate (see Architecture). Two other warnings belong to the other app.

## Live data you should know about

- **One real request** (family רוזנפלד, Nov 18 – Dec 1, 1 past sign-up) existed before approvals. When the
  approval migration added `status`, it became `pending`. The owner chose to leave it waiting for an admin.
  Don't approve or delete it yourself.
- `meal_admins` holds the 2 emails the owner chose. Add or remove admins only when the owner asks.

## Architecture

1. **No accounts for organizers or neighbors; capability links.** Public slug `/b/:slug`; neighbor's own sign-up
   `/s/:token`; organizer `/m/:token`. Tokens are 18 random bytes, base64url.
2. **Tables are closed to the browser.** RLS on, no policies, no grants to `anon`/`authenticated`. The browser calls
   only `SECURITY DEFINER` functions `public.meal_*`, which check the slug, token, or (for `meal_admin_*`) that the
   signed-in user's **confirmed** email is in `meal_admins`. Supabase grants new public functions to `anon` by
   default, so the migrations revoke what visitors must not call.
3. **Approval:** `meal_boards.status` is `pending | approved | declined`. Only approved boards are visible or take
   sign-ups. Editing a declined board sets it back to pending. Admin actions: approve, decline with a note,
   move back to waiting, delete, manage the admin list (can't remove yourself or the last admin).
4. **Privacy:** the public board shows first names only. Address/phone go to a sign-up token holder; the
   organizer's email only to managers and admins.
5. **Rules exist twice.** Client: `src/lib/api/validate.ts` and `src/lib/schedule.ts`. Server: the SQL functions.
   `src/lib/api/local.ts` is a **demo mode** with the same rules (used when no Supabase env vars are set; the visitor
   acts as a demo admin there). Keep all three in step.
6. **Closed days are stored** (`blocked_dates`): Shabbat/Yom Tov (Israel or diaspora calendar via `@hebcal/core`)
   plus the organizer's manual changes. The server enforces the stored list.
7. **Email is opt-in on the client:** the app calls the Edge Functions only when `VITE_EMAIL_ENABLED=true`.

## Email functions (all deployed with JWT verification off; each checks its own caller)

| Function | Trigger | Caller check |
| --- | --- | --- |
| `meal-notify-request` | App, after a request is sent | Organizer's manage token; sends once (`admins_notified_at`) |
| `meal-notify-decision` | App, after an admin approves/declines | Caller's Supabase session must be a listed, confirmed admin |
| `meal-notify-signup` | App, after a sign-up | Neighbor's edit token; sends once (`notified_at`) |
| `meal-send-reminders` | pg_cron daily 16:07 UTC (18:07/19:07 Israel) | Secret in Supabase Vault, checked by `meal_check_cron_secret` (service role only) |
| `meal-recover-links` | `/links` page | None needed; always answers OK; links go only to the matching email |

The cron job, Vault secret and check function are in `supabase/setup/meal_reminder_schedule.sql`
(project-specific, applied live, not run by the test script). The function source of truth is
`supabase/functions/`. They were deployed with the Supabase MCP tool, uploading `../_shared/common.ts`
next to each `index.ts`.

## Routes

`/` home · `/new` request wizard · `/b/:slug` board · `/s/:token` my sign-up · `/m/:token` organizer ·
`/admin` admin sign-in and review · `/links` find your links.

## Verified on 2026-11-22

- `npx vitest run`: 12 tests pass. `npm run build` passes. `deno check supabase/functions/meal-*/index.ts` passes.
- `npm run test:db -- <psql args>`: `tests/sql/rpc.test.sql` and `tests/sql/admin.test.sql` pass on Postgres 16 (uses a
  stand-in `auth` schema; creates and drops its own database).
- Browser (Playwright), demo mode: request → pending → admin declines with a note → organizer edits → admin approves →
  neighbor signs up (email required and validated) → edits → organizer view. Hebrew phone layout has no sideways scroll.
- Live: request → hidden while pending → approved (by SQL, since no admin has signed in) → sign-up; `meal-notify-request`
  and `meal-notify-signup` returned 200. Visitors are refused by `meal_admin_*`, `meal_admins`, and
  `meal_check_cron_secret`. The reminder job ran through pg_cron's path and returned `{"ok":true,"day":"<tomorrow>","sent":0}`.
  Test data was deleted.
- **Never verified:** an email actually being delivered, and an admin signing in with a real link.

## Other open items

1. No abuse protection: anyone can send many requests or sign-ups. Consider rate limiting or a captcha.
2. Migration history: applied via the Supabase MCP tool as `meal_boards_init`, `meal_approval_admins`,
   `meal_reminder_schedule`, so remote versions differ from the local file names. Run `supabase migration repair`
   before any `supabase db push`.
3. Bundle about 600 KB (190 KB gzip), mostly `@hebcal/core` and Supabase. Code-split routes if load time matters.
4. Not built yet: other kinds of help besides meals, a thank-you wall, multi-board dashboard, templates, a theme toggle,
   browser tests committed to the repo.

## Run it

```bash
npm install
npm run dev     # demo mode without .env
npm test
npm run build
npm run test:db -- -h localhost -p 5432 -U postgres
```

## Map of the code

```
src/lib/types.ts           domain types and limits
src/lib/schedule.ts        day kinds, closed days, progress, delivery windows
src/lib/jewishCalendar.ts  holidays and Hebrew dates
src/lib/i18n.tsx           all UI text, Hebrew and English
src/lib/api/               Api interface; supabase.ts, local.ts (demo), validate.ts
src/pages/                 Home, NewBoard, PublicBoard, MySignup, Manage, Links, Admin
src/components/            ui kit, Calendar, BoardForm, BoardView, SignupParts, Layout
supabase/migrations/       portable schema and functions (run by the test script)
supabase/setup/            project-specific reminder schedule
supabase/functions/        meal-* Edge Functions and _shared/common.ts
tests/                     vitest + sql/*.test.sql
```

## Conventions

- Prefix every new database object, function, secret and job with `meal`.
- All user-facing text goes in `src/lib/i18n.tsx`, in both languages.
- Logical CSS only (`ms-`, `me-`, `start-`, `end-`) so RTL works; colors are tokens in `src/index.css`.
- Never commit `.env`; never put secrets in `VITE_*` variables.
