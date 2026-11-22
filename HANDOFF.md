# Handoff: שכנות למען שכנות · Neighbors for Neighbors

Status as of 2026-11-22 (afternoon). Repo `mosesar9319/Neither-Meal-Helper`, branch
`claude/neighborly-meal-circle-redesign-ncgqq2`. **This branch is Netlify's production branch: every push deploys
the live site.** PR #1 (Cursor's hardening work) was ported here and closed.

Live site: **https://neighborly-meal-circle.netlify.app**

## What it is

A Hebrew-first (RTL) web app, with English, for organizing meals for a family after a birth, during illness,
or in hard times. An organizer sends a **meal request**; a **site admin approves** it; the organizer shares the
board link (usually in a WhatsApp group); neighbors pick a meal to cook and get an **email reminder the evening
before**. No user accounts except for admins. Light purple theme, light/dark following the system.

It rebuilds an earlier Lovable app (`neighborly-meal-circle.lovable.app`) with a new design and more features.

## Current state at a glance

| Area | State |
| --- | --- |
| Site | Live on Netlify (`neighborly-meal-circle`), deploys from this branch. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable), `VITE_EMAIL_ENABLED=true` |
| Database | Live; migrations `meal_boards_init`, `meal_approval_admins`, `meal_reminder_schedule`, `meal_organizer_email_lookup` |
| Email | Resend, sending domain `meals.dafsync.com` (verified; DNS at Spaceship, subdomain records only). Function secrets `MEAL_RESEND_API_KEY`, `MEAL_EMAIL_FROM`, `MEAL_SITE_URL` are set |
| Email functions | 5 deployed (v3, 2026-11-22): claim-before-send + Resend `Idempotency-Key` |
| Reminders | pg_cron daily 16:07 UTC (18:07 Israel winter). Dry run on 2026-11-22 found the TEST sign-up for Nov 23 |
| Admins | 2 emails in `meal_admins`; one has signed in successfully |
| Supabase Auth | SMTP via Resend (`smtp.resend.com:465`), 30 emails/hour, redirect URL `<site>/admin` added. Site URL left as the other app's. **New sign-ups ON** (shared setting, see below) |

GrokBot's end-to-end test on 2026-11-22 passed: admin notification, admin sign-in (email landed in spam),
approval email, sign-up thank-you and organizer notice. **Pending: the reminder email from tonight's run.**

## Next tasks (in order)

1. **After tonight's reminder (18:07 Israel, Nov 22):** confirm the TEST neighbor got it, then delete the TEST board
   ("בדיקה TEST", slug `61ee215f1792`) from `/admin` or with
   `delete from public.meal_boards where slug = '61ee215f1792';`. Its management link is in GrokBot's notes, not here.
2. **Rotate the Resend API key** (it appeared in a tool log). Create a new key with **sending access only**, limited
   to `meals.dafsync.com`, set it as `MEAL_RESEND_API_KEY` and as the Auth SMTP password, then delete the old key.
3. **Apply the Auth email templates** in `supabase/templates/` (Supabase → Authentication → Emails → Magic link and
   Confirm signup). They are neutral on purpose; see the shared-Auth note below.
4. **Consider turning new sign-ups back off.** It was turned on because the admin's first magic link was refused
   (422 "Signups not allowed"). With it on, anyone can create an Auth account in the shared project and make it send
   confirmation emails from `meals.dafsync.com`. Accounts gain no data access in either app, but it costs email
   reputation and quota. Safer: keep it off and create each new admin's Auth user from the dashboard
   (Authentication → Users → Add user, email only) when adding them to `meal_admins`. `tirtsa05` has no Auth user yet.
5. **Decide on a dedicated Supabase project** (see "Shared project"). Recommended before real use grows.

## Shared Supabase project (read before touching the database)

- Project `vipbambqmpjftdzouwsi`, named **"signature-filings"**, region us-east-1, free plan. It also hosts an
  unrelated orders app (`customers`, `orders`, `order_items`, `admin_users`, `contact_messages`). The free plan's
  2-project limit forced the sharing. **Don't touch the other app's tables, functions, policies or Auth settings
  beyond what the meal app needs.**
- Everything for this app is prefixed: tables `meal_*`, browser functions `public.meal_*`, helpers in the
  `meal_private` schema, Edge Functions `meal-*`, secrets `MEAL_*`, cron job `meal-send-reminders`.
- Supabase Auth (users, SMTP, templates, redirect URLs, the sign-up switch) is shared. A meal admin's Auth account
  can't see the other app's data: every policy there requires its own `admin_users` row (checked 2026-11-22).
- Because SMTP is shared, **all of the other app's Auth emails now also come from "שכנות למען שכנות"
  &lt;meals@meals.dafsync.com&gt;**, and any template change affects both apps. That's why the templates in
  `supabase/templates/` don't name either app.
- The free project pauses after about a week without activity, which takes both apps down.
- The security advisor flags the `meal_*` functions as callable without signing in and the `meal_*` tables as
  "RLS enabled, no policy". Both are deliberate (see Architecture). Two other warnings belong to the other app.

## Live data you should know about

- **TEST board** "בדיקה TEST" (slug `61ee215f1792`), with one TEST sign-up for dinner on Nov 23. Delete it after
  tonight's reminder is confirmed.
- **One real request** (family רוזנפלד, Nov 18 – Dec 1, 1 past sign-up) existed before approvals. When the
  approval migration added `status`, it became `pending`. The owner chose to leave it waiting for an admin.
  Don't approve or delete it yourself.
- `meal_admins` holds the 2 emails the owner chose. Add or remove admins only when the owner asks.
- One Auth user was created for the meal app (the first admin), by GrokBot.

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
| `meal-notify-request` | App, after a request is sent | Organizer's manage token; claims `admins_notified_at` |
| `meal-notify-decision` | App, after an admin approves/declines | Caller's Supabase session must be a listed, confirmed admin |
| `meal-notify-signup` | App, after a sign-up | Neighbor's edit token; claims `notified_at` |
| `meal-send-reminders` | pg_cron daily 16:07 UTC | Secret in Supabase Vault, checked by `meal_check_cron_secret` (service role only). Body `{"dryRun": true}` reports without sending |
| `meal-recover-links` | `/links` page | None needed; always answers OK; exact lookup via `meal_organizer_board_ids` (service role only) |

Every send is **claimed before sending** and the claim is released if the send fails, and every email carries a
Resend `Idempotency-Key`, so a retry can't deliver a second copy. Shared code: `supabase/functions/_shared/logic.ts`
(pure, unit-tested by `tests/email.test.ts`) and `common.ts` (Deno env, Supabase client, sending).
`supabase/config.toml` records `verify_jwt = false` for all five, matching the live deployment.

To redeploy with the Supabase MCP tool, upload `index.ts` plus `../_shared/common.ts` and `../_shared/logic.ts`.
The cron job, Vault secret and check function are in `supabase/setup/meal_reminder_schedule.sql`.

To check the reminder job without sending (run in the SQL editor, then read `net._http_response`):

```sql
select net.http_post(
  url := 'https://vipbambqmpjftdzouwsi.supabase.co/functions/v1/meal-send-reminders',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'meal_cron_secret')),
  body := '{"dryRun": true}'::jsonb);
```

## Routes

`/` home · `/new` request wizard · `/b/:slug` board · `/s/:token` my sign-up · `/m/:token` organizer ·
`/admin` admin sign-in and review · `/links` find your links.

## Verified on 2026-11-22

- After porting PR #1: `npx vitest run` 22 tests pass (adds DST, idempotency-key, email-format and branding tests);
  SQL suites pass including the exact organizer lookup; `deno check` passes for all five functions. Live: the
  lookup migration is applied, all five functions answer harmless probes as expected with no errors in the logs,
  and a reminder dry run found exactly the TEST sign-up for tomorrow.

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
   `meal_reminder_schedule`, `meal_organizer_email_lookup`, so remote versions differ from the local file names.
   Run `supabase migration repair` before any `supabase db push`.
3. Admin sign-in emails land in spam: brand-new sending domain plus the default template. The templates in
   `supabase/templates/` should help; moving DMARC from `p=none` to `p=quarantine` after a few weeks of clean sending also helps.
4. Bundle about 600 KB (190 KB gzip), mostly `@hebcal/core` and Supabase. Code-split routes if load time matters.
5. Not built yet: other kinds of help besides meals, a thank-you wall, multi-board dashboard, templates, a theme toggle,
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
supabase/functions/        meal-* Edge Functions; _shared/logic.ts (pure) and common.ts (Deno)
supabase/templates/        Auth email templates to paste into the dashboard
tests/                     vitest (app + email logic) + sql/*.test.sql
netlify.toml               build settings (Node 22) and the SPA fallback
```

## Conventions

- Prefix every new database object, function, secret and job with `meal`.
- All user-facing text goes in `src/lib/i18n.tsx`, in both languages.
- Logical CSS only (`ms-`, `me-`, `start-`, `end-`) so RTL works; colors are tokens in `src/index.css`.
- Never commit `.env`; never put secrets in `VITE_*` variables.
