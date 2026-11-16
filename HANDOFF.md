# Handoff

Neighbors for Neighbors (שכנים למען שכנים) is a Hebrew-first meal board: an
organizer opens a board, shares the link, and neighbors sign up to bring a meal.
There are no accounts. The public board shows first names and dishes only.

This file is the operator checklist. Product behavior is in `README.md`.
`HANDOFF.md` was not in the branch that held the rebuild; this one records what
that code already did and what is still a person's job.

## Already built

- React + TypeScript + Vite + Tailwind UI: home, four-step setup, public board
  (`/b/:slug`), personal sign-up link (`/s/:token`), management (`/m/:token`),
  saved links (`/links`). Hebrew and English, light and dark, RTL.
- Scheduling: several meals a day, capacity, Shabbat and Yom Tov closed
  (Israel or diaspora), Friday and holiday-eve drop-off times, manual open/close.
- Demo mode when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are empty.
  Boards stay in that browser.
- Supabase migration, `meal_`-prefixed tables and functions, `meal_private`
  helpers. The browser calls only those functions. Tables have RLS and no
  policies, and anon cannot read them.
- Email functions `notify-signup`, `send-reminders`, and `recover-links`.
  They are unit-tested against the Resend request shape. They have not been
  called against a live Resend account or a live Supabase project from here.

## Netlify

`netlify.toml` sets:

- Build command: `npm run build`
- Publish directory: `dist`
- Node: 22 (`NODE_VERSION`, because Vite 8 needs Node 22.12+ or 20.19+)
- SPA rewrite: `/*` → `/index.html` with status 200

`public/_redirects` is the same rewrite. Connect the GitHub repo in Netlify and
leave the UI build settings on the defaults from `netlify.toml`, or set them to
the same command and publish directory.

### Frontend environment variables

Set these in Netlify → Site configuration → Environment variables. They are
build-time values: Vite inlines them, so changing one means a new deploy.
Never commit the values. `.env.example` lists the same names.

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL, `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The anon / public API key. This key is visible in the browser on purpose. |
| `VITE_EMAIL_ENABLED` | The literal `true` after the functions below are deployed. Leave unset or set to anything else until then. |

No other frontend variable is read. Do not put `RESEND_API_KEY`, `EMAIL_FROM`,
`APP_URL`, `CRON_SECRET`, or the service-role key in Netlify.

## Supabase function secrets

From a checkout of this repo, linked to the shared project
(`supabase link --project-ref <project-ref>`):

```bash
supabase secrets set \
  RESEND_API_KEY='re_xxxxxxxx' \
  EMAIL_FROM='Neighbors for Neighbors <meals@your-domain.com>' \
  APP_URL='https://your-netlify-site.example' \
  CRON_SECRET="$(openssl rand -hex 32)"
```

| Secret | What it is |
| --- | --- |
| `RESEND_API_KEY` | Resend API key. Create it in the Resend dashboard. |
| `EMAIL_FROM` | Sender, `email@verified-domain` or `Name <email@verified-domain>`. The domain must be verified in Resend. |
| `APP_URL` | Public origin of the Netlify site, no trailing slash. Used in every email link. `SITE_URL` is still read if `APP_URL` is unset. |
| `CRON_SECRET` | Long random string (32+ bytes). Not a Supabase key. |

Supabase injects these itself. Do not set them by hand:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (legacy) or `SUPABASE_SECRET_KEYS` (current)

Copy `supabase/functions/.env.example` to `supabase/functions/.env` for
`supabase functions serve`. That file is gitignored.

### Deploy the functions

`supabase/config.toml` leaves JWT verification on for `notify-signup` and
`recover-links` (the browser calls them with the anon key) and turns it off for
`send-reminders` (the cron secret is not a JWT). Deploy from this repo so that
file is applied:

```bash
supabase functions deploy notify-signup recover-links send-reminders
```

Apply the SQL migrations first if the project does not already have them:

```bash
supabase db push
```

Or paste `supabase/migrations/*.sql` into the SQL editor in filename order.
The second migration adds `meal_organizer_board_ids`, which `recover-links`
uses so an address containing `%` or `_` cannot match someone else's boards.
Asking again for the same boards within 24 hours does not send a second copy.
Opening another board and asking again does.

### Schedule `send-reminders`

Enable the `pg_cron` and `pg_net` extensions if this project does not already
use them (Database → Extensions). Enable Vault the same way if it is off.

Run this once in the SQL editor. Use the same `CRON_SECRET` you set above, and
the project URL with no path on the end. The names are prefixed `meal_` so they
do not collide with other apps in the shared project.

```sql
select vault.create_secret('https://PROJECT_REF.supabase.co', 'meal_project_url');
select vault.create_secret('PASTE_THE_CRON_SECRET', 'meal_cron_secret');

select cron.schedule(
  'meal-send-reminders',
  '0 6 * * *', -- 06:00 UTC daily = 08:00 IST or 09:00 IDT
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'meal_project_url')
            || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'meal_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

`0 6 * * *` is once a day, in the Israel morning, so "tomorrow" is still the
next civil date. The function also accepts the secret in `x-cron-secret` or
`apikey` if a scheduler cannot set `Authorization`. To remove the job:

```sql
select cron.unschedule('meal-send-reminders');
```

Confirm a run in `net._http_response` or the Edge Function logs. A platform
401 whose body talks about a JWT means `verify_jwt` is still on: deploy
`send-reminders` again from this repo.

## Still needs a person

- A Netlify site connected to this GitHub repo, with the three frontend
  variables above. GitHub's default branch is
  `claude/neighborly-meal-circle-redesign-ncgqq2`, which is the only branch
  that existed. `main` points at the initial commit so the app can be
  reviewed in a pull request. After that merges, set the repository default
  branch to `main` if new clones should start there.
- The shared Supabase project: permission to push migrations, set function
  secrets, and deploy functions. This session did not call the live project.
- A Resend account, an API key, and DNS for the sending domain (the DKIM and
  SPF records Resend shows). Until the domain is verified, Resend will reject
  `EMAIL_FROM`.
- `APP_URL` set to the real public URL (the Netlify hostname or a custom
  domain). Links in email are omitted when it is empty.
- `VITE_EMAIL_ENABLED=true` only after a test sign-up produces both emails.
- The cron SQL above, run once, and a check the next morning that
  `send-reminders` logged a 200.
- Optional custom domain on Netlify, and DNS for it.

Security advisor warnings on the public `meal_*` RPCs (callable without a
login) and on tables with RLS but no policies are expected. Do not grant anon
access to the tables or to `meal_organizer_board_ids`.
