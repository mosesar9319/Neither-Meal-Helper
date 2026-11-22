-- Meal requests need an admin's approval before they go live.
--
--   * A new board starts as 'pending'. Until an admin approves it, the public
--     board link shows nothing and nobody can sign up to cook.
--   * Admins sign in with Supabase Auth (email link). A signed-in user is an
--     admin only if their confirmed email is listed in meal_admins.
--   * Neighbors who sign up to cook must now give an email, for reminders.

alter table public.meal_boards
  add column status            text not null default 'pending' check (status in ('pending','approved','declined')),
  add column review_note       text not null default '' check (char_length(review_note) <= 500),
  add column reviewed_at       timestamptz,
  add column reviewed_by       text not null default '',
  add column admins_notified_at timestamptz;
create index meal_boards_status_idx on public.meal_boards (status, created_at desc);

create table public.meal_admins (
  email      text primary key check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  added_by   text not null default '',
  created_at timestamptz not null default now()
);
alter table public.meal_admins enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.meal_admins from %I', r);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- helpers

-- True when the caller is signed in with a confirmed email that is on the admin list.
-- Reads auth.users rather than the token's claims, so an unconfirmed account can't pass.
create function meal_private.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from auth.users u
    join public.meal_admins a on a.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

create function meal_private.require_admin() returns text
language plpgsql stable set search_path = '' as $$
declare e text;
begin
  perform meal_private.check(meal_private.is_admin(), 'forbidden');
  select lower(email) into e from auth.users where id = auth.uid();
  return e;
end $$;

create or replace function meal_private.board_json(b public.meal_boards) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'slug', b.slug,
    'familyName', b.family_name,
    'startDate', b.start_date,
    'endDate', b.end_date,
    'slots', to_jsonb(b.slots),
    'perSlot', b.per_slot,
    'blockedDates', to_jsonb(b.blocked_dates),
    'details', b.details,
    'status', b.status,
    'reviewNote', b.review_note
  );
$$;

-- Sign-ups now require an email (used for the reminder the evening before).
create or replace function meal_private.validate_contact(p jsonb) returns void
language plpgsql stable set search_path = '' as $$
begin
  perform meal_private.check(jsonb_typeof(p) = 'object', 'invalid');
  perform meal_private.check(
        meal_private.text_ok(p->'name', 80, true)
    and meal_private.text_ok(p->'phone', 30, true)
    and meal_private.text_ok(p->'email', 200, true)
    and btrim(p->>'email') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and meal_private.text_ok(p->'dish', 200)
    and meal_private.text_ok(p->'note', 500), 'invalid');
end $$;

-- ---------------------------------------------------------------- public API changes

-- Only approved boards are visible.
create or replace function public.meal_get_public_board(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.meal_boards;
begin
  select * into b from public.meal_boards where slug = p_slug and status = 'approved';
  perform meal_private.check(found, 'not_found');
  return jsonb_build_object(
    'board', meal_private.board_json(b),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'date', s.meal_date, 'slot', s.slot,
               'name', split_part(btrim(s.name), ' ', 1),
               'dish', s.dish)
             order by s.meal_date, s.slot, s.created_at)
      from public.meal_signups s where s.board_id = b.id), '[]'::jsonb));
end $$;

-- Only approved boards take sign-ups.
create or replace function public.meal_sign_up(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b  public.meal_boards;
  pr public.meal_board_private;
  d  date;
  sl text;
  taken int;
  tok text := meal_private.new_token();
  new_id uuid;
begin
  select * into b from public.meal_boards where slug = p_slug and status = 'approved' for update;
  perform meal_private.check(found, 'not_found');
  perform meal_private.validate_contact(p);
  perform meal_private.check(meal_private.date_ok(p->'date'), 'invalid');
  d  := (p->>'date')::date;
  sl := p->>'slot';
  perform meal_private.check(d between b.start_date and b.end_date and d >= current_date - 1, 'day_closed');
  perform meal_private.check(not (d = any(b.blocked_dates)) and sl = any(b.slots), 'day_closed');
  select count(*) into taken from public.meal_signups where board_id = b.id and meal_date = d and slot = sl;
  perform meal_private.check(taken < b.per_slot, 'slot_full');

  insert into public.meal_signups (board_id, meal_date, slot, name, phone, email, dish, note, edit_token)
  values (b.id, d, sl, btrim(p->>'name'), btrim(p->>'phone'),
          lower(btrim(p->>'email')), coalesce(btrim(p->>'dish'), ''), coalesce(btrim(p->>'note'), ''), tok)
  returning id into new_id;

  select * into pr from public.meal_board_private where board_id = b.id;
  return jsonb_build_object('editToken', tok, 'signupId', new_id, 'private', meal_private.private_json(pr, false));
end $$;

-- Editing a declined request sends it back for review.
create or replace function public.meal_update_board(p_token text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.meal_managers;
begin
  m := meal_private.manager_by_token(p_token);
  perform meal_private.validate_board(p);
  update public.meal_boards set
    family_name   = btrim(p->>'familyName'),
    start_date    = (p->>'startDate')::date,
    end_date      = (p->>'endDate')::date,
    slots         = meal_private.json_texts(p->'slots'),
    per_slot      = (p->>'perSlot')::int,
    blocked_dates = meal_private.json_dates(p->'blockedDates'),
    details       = p->'details',
    updated_at    = now(),
    status        = case when status = 'declined' then 'pending' else status end,
    admins_notified_at = case when status = 'declined' then null else admins_notified_at end
  where id = m.board_id;
  update public.meal_board_private set
    address         = coalesce(p->'private'->>'address', ''),
    instructions    = coalesce(p->'private'->>'instructions', ''),
    phone           = coalesce(p->'private'->>'phone', ''),
    organizer_email = coalesce(p->'private'->>'organizerEmail', '')
  where board_id = m.board_id;
end $$;

-- ---------------------------------------------------------------- admin API

-- Lets the sign-in page send a link only to listed admins.
create function public.meal_admin_login_allowed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.meal_admins where email = lower(btrim(coalesce(p_email, ''))));
$$;

create function public.meal_admin_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e text;
begin
  select lower(email) into e from auth.users where id = auth.uid();
  return jsonb_build_object('email', coalesce(e, ''), 'isAdmin', meal_private.is_admin());
end $$;

create function public.meal_admin_list_requests(p_status text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform meal_private.require_admin();
  perform meal_private.check(p_status in ('pending','approved','declined'), 'invalid');
  return coalesce((
    select jsonb_agg(
      meal_private.board_json(b) || jsonb_build_object(
        'createdAt', b.created_at,
        'reviewedAt', b.reviewed_at,
        'reviewedBy', b.reviewed_by,
        'private', meal_private.private_json(pr, true),
        'manageToken', (select m.token from public.meal_managers m where m.board_id = b.id and m.role = 'owner' limit 1),
        'signupCount', (select count(*) from public.meal_signups s where s.board_id = b.id))
      order by b.created_at desc)
    from public.meal_boards b
    join public.meal_board_private pr on pr.board_id = b.id
    where b.status = p_status), '[]'::jsonb);
end $$;

create function public.meal_admin_review(p_slug text, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare e text;
begin
  e := meal_private.require_admin();
  perform meal_private.check(p_status in ('pending','approved','declined'), 'invalid');
  perform meal_private.check(char_length(coalesce(p_note, '')) <= 500, 'invalid');
  update public.meal_boards set
    status = p_status,
    review_note = btrim(coalesce(p_note, '')),
    reviewed_at = now(),
    reviewed_by = e
  where slug = p_slug;
  perform meal_private.check(found, 'not_found');
end $$;

create function public.meal_admin_delete_board(p_slug text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform meal_private.require_admin();
  delete from public.meal_boards where slug = p_slug;
  perform meal_private.check(found, 'not_found');
end $$;

create function public.meal_admin_list_admins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform meal_private.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('email', a.email, 'addedBy', a.added_by, 'createdAt', a.created_at) order by a.created_at)
    from public.meal_admins a), '[]'::jsonb);
end $$;

create function public.meal_admin_add(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare e text; new_email text := lower(btrim(coalesce(p_email, '')));
begin
  e := meal_private.require_admin();
  perform meal_private.check(new_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(new_email) <= 200, 'invalid');
  perform meal_private.check((select count(*) from public.meal_admins) < 50, 'invalid');
  insert into public.meal_admins (email, added_by) values (new_email, e) on conflict (email) do nothing;
end $$;

create function public.meal_admin_remove(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare e text;
begin
  e := meal_private.require_admin();
  -- Never remove yourself or the last admin, so the site can't lock itself out.
  perform meal_private.check(lower(btrim(coalesce(p_email, ''))) <> e, 'forbidden');
  perform meal_private.check((select count(*) from public.meal_admins) > 1, 'forbidden');
  delete from public.meal_admins where email = lower(btrim(coalesce(p_email, '')));
end $$;

-- ---------------------------------------------------------------- grants

revoke execute on all functions in schema meal_private from public;
revoke execute on function
  public.meal_admin_login_allowed(text), public.meal_admin_me(), public.meal_admin_list_requests(text),
  public.meal_admin_review(text, text, text), public.meal_admin_delete_board(text),
  public.meal_admin_list_admins(), public.meal_admin_add(text), public.meal_admin_remove(text)
from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on all functions in schema meal_private from anon;
    -- Supabase grants new public functions to anon by default; take the admin ones back.
    revoke execute on function
      public.meal_admin_me(), public.meal_admin_list_requests(text),
      public.meal_admin_review(text, text, text), public.meal_admin_delete_board(text),
      public.meal_admin_list_admins(), public.meal_admin_add(text), public.meal_admin_remove(text)
    from anon;
    grant execute on function public.meal_admin_login_allowed(text) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on all functions in schema meal_private from authenticated;
    grant execute on function
      public.meal_admin_login_allowed(text), public.meal_admin_me(), public.meal_admin_list_requests(text),
      public.meal_admin_review(text, text, text), public.meal_admin_delete_board(text),
      public.meal_admin_list_admins(), public.meal_admin_add(text), public.meal_admin_remove(text)
    to authenticated;
  end if;
end $$;
