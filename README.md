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

1. In the shared Supabase project, apply every file in `supabase/migrations/`
   (`supabase db push`, or paste them into the SQL editor in order).
2. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (Project Settings → API). Use the anon (public) key.

The browser only calls the SQL functions in the migration; the tables themselves
are closed to it. Every table and function is prefixed `meal_` (helpers live in the
`meal_private` schema), so the app can share a Supabase project with other apps.
Supabase's security advisor will flag the `meal_*` functions as callable without
signing in and the tables as having no policies — both are intentional here.
`meal_organizer_board_ids` is the exception: only the service role may call it.

### Emails (optional)

Three Edge Functions in `supabase/functions` send email through
[Resend](https://resend.com/docs/api-reference/emails/send-email):

| Function | What it does |
| --- | --- |
| `notify-signup` | Tells the organizer about a new sign-up and sends the neighbor a confirmation |
| `send-reminders` | Run daily: reminds everyone cooking tomorrow (Israel time) |
| `recover-links` | Emails an organizer the management links for boards opened with their email |

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxx \
  EMAIL_FROM="Neighbors for Neighbors <meals@your-domain.com>" \
  APP_URL=https://your-site.example \
  CRON_SECRET="$(openssl rand -hex 32)"

supabase functions deploy notify-signup recover-links send-reminders
```

`APP_URL` is the public origin of this site (no trailing slash). `EMAIL_FROM` must
be an address on a domain you have verified in Resend, either bare or
`Name <email@domain>`. `CRON_SECRET` is a long random string; it is not a Supabase
key. `send-reminders` is deployed with `verify_jwt = false` (`supabase/config.toml`)
and accepts only that secret, because a cron caller does not have a user JWT.

Then set `VITE_EMAIL_ENABLED=true` on the site and redeploy so the app calls the
functions. Schedule `send-reminders` once a day at 06:00 UTC (`0 6 * * *`), which
is 08:00 or 09:00 in Israel. The exact Vault and `pg_cron` statements are in
`HANDOFF.md`. The request must be a POST with `Authorization: Bearer <CRON_SECRET>`.

Without these secrets the app still works; it just sends no email (the calendar
file still carries reminders).

## Deploy on Netlify

`netlify.toml` builds with `npm run build`, publishes `dist/`, uses Node 22, and
rewrites unknown paths to `index.html`. `public/_redirects` repeats that rewrite.

Set these in the Netlify UI (Site configuration → Environment variables) before
the build. Vite inlines them, so changing one requires a new deploy. Do not
commit values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | For a live board | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | For a live board | Supabase anon / public key |
| `VITE_EMAIL_ENABLED` | No | The literal `true` turns email calls on. Anything else leaves them off |

Leave the Supabase pair empty and the site runs in demo mode. The service-role
key, Resend key, and cron secret are not frontend variables; they belong in
Supabase function secrets. `HANDOFF.md` is the operator checklist.

## Project layout

```
src/lib/          dates, Jewish calendar, scheduling rules, i18n, data layer (local + Supabase)
src/components/   UI kit, calendar, board view, setup form, sign-up pieces
src/pages/        Home, NewBoard, PublicBoard (/b/:slug), MySignup (/s/:token),
                  Manage (/m/:token), Links (/links)
supabase/         database migrations, email functions, config.toml
tests/            unit tests and SQL tests
HANDOFF.md        deploy checklist: Netlify variables, function secrets, cron
```
