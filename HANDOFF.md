# Handoff: Neighbors for Neighbors (שכנות למען שכנות)

Status as of 2026-11-16. Repo: `mosesar9319/Neither-Meal-Helper`, branch
`claude/neighborly-meal-circle-redesign-ncgqq2` (everything is committed and pushed; no PR opened).

## What this is

A web app where an organizer opens a "meal board" for a family (after a birth, illness, hard times),
shares the link in a neighborhood WhatsApp group, and neighbors sign up to bring a meal on a given day.
Hebrew first (RTL) with English, light/dark following the system. No user accounts.

It is a ground-up rebuild of an existing Lovable app (`neighborly-meal-circle.lovable.app`), which had
4 pages: home, one long create form, a day-card board, and a secret-link organizer page. The new app keeps
that model and adds the features listed below.

## Stack

React 19 + TypeScript + Vite + Tailwind v4 + react-router. `@hebcal/core` for Shabbat and Yom Tov.
Supabase (Postgres) for data. Deno Edge Functions + Resend for email (written, not deployed).
Tests: Vitest (unit) and plain SQL (database).

## What was built

**Neighbors:** board as calendar or list with Hebrew dates and a "meals covered" bar; sign up for a
specific meal (breakfast/lunch/dinner) with dish, phone, optional email; see dishes already planned;
after signing up see address, instructions, drop-off window; add-to-calendar (Google link and `.ics`
with two alarms); personal link (`/s/:token`) to edit or cancel.

**Organizers:** 4-step wizard (family, food, days, delivery); structured kashrut (level, chalav/pas/bishul
Yisrael, glatt, no kitniyot), meat/dairy/parve, dietary tags, allergies; several meals per day and up to
5 neighbors per meal; Shabbat and Yom Tov auto-closed (Israel or diaspora calendar), early drop-off window
on Fridays and holiday eves; tap any day to close or reopen; management page (`/m/:token`) with overview,
sign-ups (call and WhatsApp buttons), a ready-made "still open" WhatsApp message, day calendar, details
editor, co-organizers (own link; cannot delete the board), "new since last visit" badge; links remembered
on the device and a `/links` recovery page.

## Routes

`/` home · `/new` wizard · `/b/:slug` public board · `/s/:token` neighbor's own sign-up ·
`/m/:token` organizer · `/links` find your links.

## Architecture decisions worth knowing

1. **No accounts; capability links.** A public slug shows the board. A sign-up token (`/s/…`) and a manager
   token (`/m/…`) are the only credentials. Tokens are 18 random bytes, base64url.
2. **Tables are closed to the browser.** RLS is on, there are no policies and no grants for `anon` /
   `authenticated`. The browser only calls `SECURITY DEFINER` functions named `meal_*`, which check the slug
   or token. Helpers live in the `meal_private` schema (execute revoked). See
   `supabase/migrations/20261116000000_init.sql`.
3. **Privacy:** the public board returns first names only; address, phone and organizer email are returned only
   to a sign-up token holder (not the email) or a manager.
4. **Same rules twice.** `src/lib/api/validate.ts` + `src/lib/schedule.ts` (client) mirror the SQL checks.
   `src/lib/api/local.ts` is a demo-mode data layer with the same behavior, used when no Supabase env vars are
   set. The Supabase adapter (`src/lib/api/supabase.ts`) prefixes every call with `meal_`.
5. **Blocked days are stored.** `blocked_dates` on the board is the computed result (auto Shabbat/holidays plus
   manual changes); the server enforces the stored list, so a later change to holiday rules doesn't silently
   reopen days.
6. **Dates are plain `YYYY-MM-DD` strings** in local time; the server allows one day of slack for UTC.
7. **Email is opt-in:** the app calls the Edge Functions only when `VITE_EMAIL_ENABLED=true`.

## Live infrastructure (state now)

- **Supabase project `vipbambqmpjftdzouwsi`** (named "signature-filings", region us-east-1, free plan). It is
  **shared with another app** because the free plan allows 2 active projects and a new one was refused. All meal
  objects are prefixed `meal_` so they don't clash. The other app's data was checked before and after and is untouched.
- Migration applied via the Supabase tool under the name `meal_boards_init`. The four meal tables are empty
  (test boards were deleted).
- API URL: `https://vipbambqmpjftdzouwsi.supabase.co`. The publishable key is in the local, git-ignored `.env`
  and in the Supabase dashboard (Project Settings → API). It is not in this file.
- Security advisor flags the `meal_*` functions as callable by `anon` and the tables as "RLS enabled, no policy".
  Both are intentional (see 2). It also flags two pre-existing issues in the other app (`is_admin` executable,
  leaked-password protection off); left alone.
- **Not deployed anywhere.** No hosting yet; the Netlify connector showed `needs_reconnect` and its tools were
  not available in the session.
- **Edge Functions not deployed; Resend not configured.**

## Verified

- `npx vitest run`: 12 tests pass (holiday and Shabbat rules, diaspora calendar, manual overrides, progress,
  `.ics` output, WhatsApp numbers, full demo-API lifecycle).
- `npm run test:db -- <psql args>`: SQL tests pass against Postgres 16 (privacy, slot limits, closed days,
  roles, co-organizer limits, cascade delete, validation). Needs an empty server; it creates and drops its own database.
- `npm run build`: type-checks and builds.
- Browser flow (Playwright, Chromium) run against both demo mode and the live Supabase project: create board →
  neighbor sign-up → planned-dish hint → neighbor edit → organizer view → add co-organizer. No console errors; no
  horizontal overflow on an iPhone 13 viewport in Hebrew.
- Direct REST probes with the public key: table reads are denied, `meal_private` helpers are not exposed, unknown slug returns `not_found`.

## Not verified / open items (in rough priority order)

1. **Hosting.** Build with `npm run build`, publish `dist/`. Needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   set on the host (the `.env` is git-ignored). `public/_redirects` handles SPA routing on Netlify; other hosts need an
   equivalent fallback to `index.html`.
2. **Email has never been run.** Deploy `notify-signup`, `send-reminders`, `recover-links`; set secrets
   `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`, `CRON_SECRET`; schedule `send-reminders` daily with
   `Authorization: Bearer <CRON_SECRET>`; then set `VITE_EMAIL_ENABLED=true`.
   **Likely gotcha (untested):** the browser calls `notify-signup` and `recover-links` with the publishable key,
   which is not a JWT, so deploy those with JWT verification off (`--no-verify-jwt`); `send-reminders` authenticates
   itself with `CRON_SECRET`, so also off.
3. **No abuse protection.** Anyone with a board link can create unlimited sign-ups, and anyone can create boards.
   Consider rate limiting or a captcha before sharing widely.
4. **Migration history.** The migration was applied through the Supabase tool, so the remote migration version
   differs from the local file name `20261116000000_init.sql`. If you adopt the Supabase CLI (`db push`), reconcile
   history first (`supabase migration repair`) to avoid re-running it.
5. **Shared project risk.** Free projects pause after about a week of inactivity, which would take the meal app
   down too. Moving to a dedicated project means freeing a free-plan slot or upgrading, then re-running the migration there.
6. **Bundle size:** about 600 KB JS (192 KB gzip), mostly `@hebcal/core` and Supabase. Code-split the board/manage routes if load time matters.
7. **Not done from the original scope (Phase 3):** other kinds of help besides meals, thank-you wall,
   multi-board dashboard, board templates.
8. **No theme toggle** (follows system), no automated browser tests in the repo (the Playwright script I used lived in a scratch folder and is not included).

## Run it

```bash
npm install
npm run dev          # demo mode if no .env; boards stay in the browser
npm test             # unit tests
npm run build
npm run test:db -- -h localhost -p 5432 -U postgres   # SQL tests
```

## Map of the code

```
src/lib/types.ts          domain types and limits
src/lib/dates.ts          plain-date helpers, formatting
src/lib/jewishCalendar.ts holidays and Hebrew dates (hebcal)
src/lib/schedule.ts       day kinds, blocking, progress, delivery windows
src/lib/i18n.tsx          all UI text (en + he) and label tables
src/lib/api/              Api interface; local.ts (demo), supabase.ts, validate.ts
src/lib/device.ts         links remembered in localStorage (guarded)
src/lib/calendarExport.ts .ics and Google Calendar links
src/components/           ui kit, Calendar, BoardForm, BoardView, SignupParts, Layout
src/pages/                Home, NewBoard, PublicBoard, MySignup, Manage, Links
supabase/migrations/      schema, functions, grants
supabase/functions/       notify-signup, send-reminders, recover-links, _shared
tests/                    vitest + sql/rpc.test.sql
```

## Conventions

- Every new database object gets the `meal_` prefix; browser-callable logic goes in a `meal_*` function in `public`,
  internals in `meal_private`. Never add grants or policies that expose the tables.
- User-facing text goes through `src/lib/i18n.tsx` in both languages.
- Use logical CSS (`ms-`, `me-`, `start-`, `end-`) so RTL works; keep tokens in `src/index.css`.
- Don't commit `.env`. Don't put secrets in `VITE_*` variables (they ship to the browser); the Resend key and service role live only in Edge Function secrets.
