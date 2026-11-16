# Neighbors for Neighbors · שכנים למען שכנים

Organize warm meals for a family in your neighborhood after a birth, during
illness, or in hard times. An organizer opens a meal board, shares the link in
the neighborhood WhatsApp group, and neighbors pick a meal to bring. Hebrew
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

### Emails (optional)

Three Edge Functions in `supabase/functions` send email through
[Resend](https://resend.com):

| Function | What it does |
| --- | --- |
| `notify-signup` | Tells the organizer about a new sign-up and sends the neighbor a confirmation |
| `send-reminders` | Run daily: reminds everyone cooking tomorrow (Israel time) |
| `recover-links` | Emails an organizer the management links for boards opened with their email |

```bash
supabase secrets set RESEND_API_KEY=... EMAIL_FROM="Neighbors <meals@your-domain>" \
  SITE_URL=https://your-site CRON_SECRET=some-long-random-string
supabase functions deploy notify-signup send-reminders recover-links
```

Then set `VITE_EMAIL_ENABLED=true` in the site's environment so the app calls them.
Schedule `send-reminders` once a day (for example from Supabase Cron) with the
header `Authorization: Bearer <CRON_SECRET>`. Without these secrets the app
still works; it just sends no email (the calendar file still carries reminders).

## Deploy

`npm run build` produces a static site in `dist/`. Any static host works; the
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
