# Neighbors for Neighbors · שכנות למען שכנות

Organize warm meals for a family in your neighborhood after a birth, during
illness, or in hard times. An organizer sends a meal request; once a site
administrator approves it, the organizer shares the link in the neighborhood
WhatsApp group and neighbors pick a meal to bring. Neighbors get an email
reminder the evening before. Hebrew
first (right to left), with English, light and dark themes.

## What's in it

**For neighbors**
- The board as a calendar or a list, with Hebrew dates and a "meals covered" progress bar
- Sign up for a specific meal (breakfast, lunch, dinner), with a dish, phone and optional email
- See what others are bringing, so the menu doesn't repeat
- After signing up: the address, delivery instructions and drop-off time, an
  "add to calendar" file with reminders, and a personal link to edit or cancel

**For organizers**
- A 4-step setup: family, food (kashrut level, chalav/pas/bishul Yisrael, meat or
  dairy, dietary tags, allergies), days, and private delivery details
- Shabbat and Yom Tov close automatically (Israel or abroad holiday calendar);
  Fridays and holiday eves get an earlier drop-off time; any day can be closed or reopened
- Several meals a day and several neighbors per meal
- A management page: overview and stats, sign-ups with call/WhatsApp buttons,
  a ready-made "still open" WhatsApp message, the day calendar, details, and the team
- Co-organizers with their own link (they can edit, but only the owner can delete)
- Links remembered on the device, and recovery by email

**Privacy:** there are no accounts. The public board never includes the address,
phone numbers or emails, and shows neighbors by first name only. Private details
go only to someone holding a sign-up link or a management link.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

With no database configured the app runs in **demo mode**: everything works,
but boards are saved only in that browser. A banner says so.

```bash
npm test           # unit tests (scheduling, holidays, calendar files, demo data layer)
npm run build      # type-check and production build into dist/
npm run test:db -- -h localhost -p 5432 -U postgres   # SQL tests against a Postgres server
```

## Connect Supabase

1. Create a Supabase project and run `supabase/migrations/20261116000000_init.sql`
   (`supabase db push`, or paste it into the SQL editor).
2. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (Project Settings → API).

The browser only calls the SQL functions in the migration; the tables themselves
are closed to it. Every table and function is prefixed `meal_` (helpers live in the
`meal_private` schema), so the app can share a Supabase project with other apps.
Supabase's security advisor will flag the `meal_*` functions as callable without
signing in and the tables as having no policies — both are intentional here.

### Admins and approval

New requests start as **pending**: the public link shows nothing and nobody can
sign up until an admin approves. Admins sign in at `/admin` with an email link
(Supabase Auth); only emails in `meal_admins` can sign in. Add the first admin
with SQL, then manage the rest from the page:

```sql
insert into public.meal_admins (email) values ('someone@example.com');
```

In Supabase → Authentication → URL Configuration, add the site's `/admin` URL to
the allowed **Redirect URLs**, or sign-in links will send admins to the project's
default Site URL.

### Emails and reminders

Five Edge Functions in `supabase/functions` send email through
[Resend](https://resend.com). They're deployed with JWT verification off because
each checks its own caller.

| Function | What it does |
| --- | --- |
| `meal-notify-request` | Tells every admin about a new request |
| `meal-notify-decision` | Tells the organizer about an approval or decline (admin session required) |
| `meal-notify-signup` | Tells the organizer about a sign-up and confirms to the neighbor |
| `meal-send-reminders` | Daily: reminds everyone cooking tomorrow (Israel time) |
| `meal-recover-links` | Emails an organizer their management links |

Secrets (prefixed because the project is shared): `MEAL_RESEND_API_KEY`,
`MEAL_EMAIL_FROM`, `MEAL_SITE_URL`. Then set `VITE_EMAIL_ENABLED=true` for the site.

Every email is claimed before sending and carries a Resend `Idempotency-Key`, so
retries never deliver twice. Pure email logic lives in `supabase/functions/_shared/logic.ts`
and is unit-tested; `supabase/config.toml` records the functions' settings.

Paste the bilingual Auth email templates from `supabase/templates/` into Supabase →
Authentication → Emails (Magic link, Confirm signup).

The daily reminder run is scheduled inside the database with pg_cron
(`supabase/setup/meal_reminder_schedule.sql`, 16:07 UTC = 18:07 Israel winter
time). It authenticates with a random secret kept in Supabase Vault.

## Deploy

Live at https://neighborly-meal-circle.netlify.app (Netlify builds this branch; settings in
`netlify.toml`). `npm run build` produces a static site in `dist/`. Any static host works; the
host must send unknown paths to `index.html` (`public/_redirects` does this on Netlify).

## Project layout

```
src/lib/          dates, Jewish calendar, scheduling rules, i18n, data layer (local + Supabase)
src/components/   UI kit, calendar, board view, setup form, sign-up pieces
src/pages/        Home, NewBoard, PublicBoard (/b/:slug), MySignup (/s/:token),
                  Manage (/m/:token), Links (/links)
supabase/         database migration and email functions
tests/            unit tests and SQL tests
```
