-- Neighbors for Neighbors: meal boards.
--
-- Everything is prefixed meal_ (tables, functions, the meal_private schema) so the
-- app can live safely inside a Supabase project shared with other apps.
--
-- Privacy model (there are no user accounts):
--   * Tables are closed to the browser (RLS on, no policies, no grants).
--   * The browser calls only the functions below. Each one checks either a
--     public board slug or a secret token that came from a private link.
--   * Address, phone and organizer email leave the database only for someone
--     holding a sign-up token or a management token.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists meal_private;
revoke all on schema meal_private from public;

-- ---------------------------------------------------------------- tables

create table public.meal_boards (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  family_name   text not null check (char_length(family_name) between 1 and 120),
  start_date    date not null,
  end_date      date not null,
  slots         text[] not null check (cardinality(slots) between 1 and 3
                  and slots <@ array['breakfast','lunch','dinner']),
  per_slot      int not null default 1 check (per_slot between 1 and 5),
  blocked_dates date[] not null default '{}',
  details       jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'
                  and octet_length(details::text) <= 10000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date < 120)
);

create table public.meal_board_private (
  board_id        uuid primary key references public.meal_boards(id) on delete cascade,
  address         text not null default '' check (char_length(address) <= 200),
  instructions    text not null default '' check (char_length(instructions) <= 1000),
  phone           text not null default '' check (char_length(phone) <= 30),
  organizer_email text not null default '' check (char_length(organizer_email) <= 200)
);
create index meal_board_private_email_idx on public.meal_board_private (lower(organizer_email))
  where organizer_email <> '';

create table public.meal_managers (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.meal_boards(id) on delete cascade,
  token      text not null unique,
  name       text not null default '' check (char_length(name) <= 80),
  role       text not null check (role in ('owner','co')),
  seen_at    timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index meal_managers_board_idx on public.meal_managers (board_id);

create table public.meal_signups (
  id               uuid primary key default gen_random_uuid(),
  board_id         uuid not null references public.meal_boards(id) on delete cascade,
  meal_date        date not null,
  slot             text not null check (slot in ('breakfast','lunch','dinner')),
  name             text not null check (char_length(name) between 1 and 80),
  phone            text not null check (char_length(phone) between 1 and 30),
  email            text not null default '' check (char_length(email) <= 200),
  dish             text not null default '' check (char_length(dish) <= 200),
  note             text not null default '' check (char_length(note) <= 500),
  edit_token       text not null unique,
  reminder_sent_at timestamptz,
  notified_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index meal_signups_board_day_idx on public.meal_signups (board_id, meal_date, slot);
create index meal_signups_reminder_idx on public.meal_signups (meal_date) where reminder_sent_at is null and email <> '';

alter table public.meal_boards        enable row level security;
alter table public.meal_board_private enable row level security;
alter table public.meal_managers      enable row level security;
alter table public.meal_signups       enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.meal_boards, public.meal_board_private, public.meal_managers, public.meal_signups from %I', r);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- helpers

create function meal_private.check(ok boolean, code text) returns void
language plpgsql volatile set search_path = '' as $$
begin
  if ok is not true then
    raise exception '%', code using errcode = 'P0001';
  end if;
end $$;

create function meal_private.new_token() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_');
$$;

create function meal_private.new_slug() returns text
language sql volatile set search_path = '' as $$
  select encode(extensions.gen_random_bytes(6), 'hex');
$$;

create function meal_private.board_json(b public.meal_boards) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'slug', b.slug,
    'familyName', b.family_name,
    'startDate', b.start_date,
    'endDate', b.end_date,
    'slots', to_jsonb(b.slots),
    'perSlot', b.per_slot,
    'blockedDates', to_jsonb(b.blocked_dates),
    'details', b.details
  );
$$;

create function meal_private.private_json(p public.meal_board_private, with_email boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'address', coalesce(p.address, ''),
    'instructions', coalesce(p.instructions, ''),
    'phone', coalesce(p.phone, '')
  ) || case when with_email then jsonb_build_object('organizerEmail', coalesce(p.organizer_email, '')) else '{}'::jsonb end;
$$;

create function meal_private.signup_json(s public.meal_signups) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'date', s.meal_date, 'slot', s.slot, 'name', s.name, 'dish', s.dish,
    'phone', s.phone, 'email', s.email, 'note', s.note, 'createdAt', s.created_at
  );
$$;

create function meal_private.text_ok(v jsonb, max int, required boolean default false) returns boolean
language sql immutable set search_path = '' as $$
  select (v is null or jsonb_typeof(v) = 'null' or jsonb_typeof(v) = 'string')
     and char_length(coalesce(v #>> '{}', '')) <= max
     and (not required or char_length(btrim(coalesce(v #>> '{}', ''))) > 0);
$$;

create function meal_private.date_ok(v jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if v is null or jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  perform (v #>> '{}')::date;
  return true;
exception when others then
  return false;
end $$;

create function meal_private.validate_board(p jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare
  s date; e date;
begin
  perform meal_private.check(jsonb_typeof(p) = 'object', 'invalid');
  perform meal_private.check(meal_private.text_ok(p->'familyName', 120, true), 'invalid');
  perform meal_private.check(meal_private.date_ok(p->'startDate') and meal_private.date_ok(p->'endDate'), 'invalid');
  s := (p->>'startDate')::date;
  e := (p->>'endDate')::date;
  perform meal_private.check(e >= s and e - s < 120, 'invalid');
  perform meal_private.check(jsonb_typeof(p->'slots') = 'array' and jsonb_array_length(p->'slots') between 1 and 3, 'invalid');
  perform meal_private.check(not exists (
    select 1 from jsonb_array_elements(p->'slots') x
    where jsonb_typeof(x) <> 'string' or (x #>> '{}') not in ('breakfast','lunch','dinner')), 'invalid');
  perform meal_private.check(jsonb_typeof(p->'perSlot') = 'number' and (p->>'perSlot')::numeric between 1 and 5, 'invalid');
  perform meal_private.check(jsonb_typeof(p->'blockedDates') = 'array', 'invalid');
  perform meal_private.check(not exists (
    select 1 from jsonb_array_elements(p->'blockedDates') x
    where not meal_private.date_ok(x) or (x #>> '{}')::date not between s and e), 'invalid');
  perform meal_private.check(jsonb_typeof(p->'details') = 'object' and octet_length((p->'details')::text) <= 10000, 'invalid');
  perform meal_private.check(jsonb_typeof(p->'private') = 'object', 'invalid');
  perform meal_private.check(
        meal_private.text_ok(p->'private'->'address', 200)
    and meal_private.text_ok(p->'private'->'instructions', 1000)
    and meal_private.text_ok(p->'private'->'phone', 30)
    and meal_private.text_ok(p->'private'->'organizerEmail', 200), 'invalid');
end $$;

create function meal_private.validate_contact(p jsonb) returns void
language plpgsql stable set search_path = '' as $$
begin
  perform meal_private.check(jsonb_typeof(p) = 'object', 'invalid');
  perform meal_private.check(
        meal_private.text_ok(p->'name', 80, true)
    and meal_private.text_ok(p->'phone', 30, true)
    and meal_private.text_ok(p->'email', 200)
    and meal_private.text_ok(p->'dish', 200)
    and meal_private.text_ok(p->'note', 500), 'invalid');
end $$;

create function meal_private.manager_by_token(p_token text) returns public.meal_managers
language plpgsql stable set search_path = '' as $$
declare m public.meal_managers;
begin
  select * into m from public.meal_managers where token = p_token;
  perform meal_private.check(found, 'not_found');
  return m;
end $$;

create function meal_private.json_dates(v jsonb) returns date[]
language sql immutable set search_path = '' as $$
  select coalesce(array(select (x #>> '{}')::date from jsonb_array_elements(v) x order by 1), '{}');
$$;

create function meal_private.json_texts(v jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(select x #>> '{}' from jsonb_array_elements(v) x), '{}');
$$;

-- ---------------------------------------------------------------- public API

create function public.meal_create_board(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.meal_boards;
  tok text := meal_private.new_token();
begin
  perform meal_private.validate_board(p);
  insert into public.meal_boards (slug, family_name, start_date, end_date, slots, per_slot, blocked_dates, details)
  values (
    meal_private.new_slug(),
    btrim(p->>'familyName'),
    (p->>'startDate')::date,
    (p->>'endDate')::date,
    meal_private.json_texts(p->'slots'),
    (p->>'perSlot')::int,
    meal_private.json_dates(p->'blockedDates'),
    p->'details'
  ) returning * into b;

  insert into public.meal_board_private (board_id, address, instructions, phone, organizer_email)
  values (b.id,
    coalesce(p->'private'->>'address', ''),
    coalesce(p->'private'->>'instructions', ''),
    coalesce(p->'private'->>'phone', ''),
    coalesce(p->'private'->>'organizerEmail', ''));

  insert into public.meal_managers (board_id, token, name, role)
  values (b.id, tok, left(coalesce(p->'details'->>'organizerName', ''), 80), 'owner');

  return jsonb_build_object('slug', b.slug, 'manageToken', tok);
end $$;

create function public.meal_get_public_board(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.meal_boards;
begin
  select * into b from public.meal_boards where slug = p_slug;
  perform meal_private.check(found, 'not_found');
  return jsonb_build_object(
    'board', meal_private.board_json(b),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'date', s.meal_date, 'slot', s.slot,
               -- first name only on the public board
               'name', split_part(btrim(s.name), ' ', 1),
               'dish', s.dish)
             order by s.meal_date, s.slot, s.created_at)
      from public.meal_signups s where s.board_id = b.id), '[]'::jsonb));
end $$;

create function public.meal_sign_up(p_slug text, p jsonb) returns jsonb
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
  -- Lock the board so two neighbors can't take the last place at once.
  select * into b from public.meal_boards where slug = p_slug for update;
  perform meal_private.check(found, 'not_found');
  perform meal_private.validate_contact(p);
  perform meal_private.check(meal_private.date_ok(p->'date'), 'invalid');
  d  := (p->>'date')::date;
  sl := p->>'slot';
  -- One day of slack for time zones: the server clock runs on UTC.
  perform meal_private.check(d between b.start_date and b.end_date and d >= current_date - 1, 'day_closed');
  perform meal_private.check(not (d = any(b.blocked_dates)) and sl = any(b.slots), 'day_closed');
  select count(*) into taken from public.meal_signups where board_id = b.id and meal_date = d and slot = sl;
  perform meal_private.check(taken < b.per_slot, 'slot_full');

  insert into public.meal_signups (board_id, meal_date, slot, name, phone, email, dish, note, edit_token)
  values (b.id, d, sl, btrim(p->>'name'), btrim(p->>'phone'),
          coalesce(btrim(p->>'email'), ''), coalesce(btrim(p->>'dish'), ''), coalesce(btrim(p->>'note'), ''), tok)
  returning id into new_id;

  select * into pr from public.meal_board_private where board_id = b.id;
  return jsonb_build_object('editToken', tok, 'signupId', new_id, 'private', meal_private.private_json(pr, false));
end $$;

create function public.meal_get_my_signup(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.meal_signups; b public.meal_boards; pr public.meal_board_private;
begin
  select * into s from public.meal_signups where edit_token = p_token;
  perform meal_private.check(found, 'not_found');
  select * into b from public.meal_boards where id = s.board_id;
  select * into pr from public.meal_board_private where board_id = s.board_id;
  return jsonb_build_object(
    'board', meal_private.board_json(b),
    'private', meal_private.private_json(pr, false),
    'signup', meal_private.signup_json(s));
end $$;

create function public.meal_update_my_signup(p_token text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform meal_private.validate_contact(p);
  update public.meal_signups set
    name = btrim(p->>'name'), phone = btrim(p->>'phone'),
    email = coalesce(btrim(p->>'email'), ''), dish = coalesce(btrim(p->>'dish'), ''),
    note = coalesce(btrim(p->>'note'), '')
  where edit_token = p_token;
  perform meal_private.check(found, 'not_found');
end $$;

create function public.meal_cancel_my_signup(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.meal_signups where edit_token = p_token;
  perform meal_private.check(found, 'not_found');
end $$;

create function public.meal_get_manage(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.meal_managers; b public.meal_boards; pr public.meal_board_private;
begin
  m := meal_private.manager_by_token(p_token);
  select * into b from public.meal_boards where id = m.board_id;
  select * into pr from public.meal_board_private where board_id = m.board_id;
  return jsonb_build_object(
    'board', meal_private.board_json(b),
    'private', meal_private.private_json(pr, true),
    'signups', coalesce((
      select jsonb_agg(meal_private.signup_json(s) order by s.meal_date, s.slot, s.created_at)
      from public.meal_signups s where s.board_id = b.id), '[]'::jsonb),
    'managers', (
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'role', x.role, 'createdAt', x.created_at)
             order by x.role desc, x.created_at)
      from public.meal_managers x where x.board_id = b.id),
    'me', jsonb_build_object('id', m.id, 'name', m.name, 'role', m.role, 'createdAt', m.created_at, 'seenAt', m.seen_at));
end $$;

create function public.meal_update_board(p_token text, p jsonb) returns void
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
    updated_at    = now()
  where id = m.board_id;
  update public.meal_board_private set
    address         = coalesce(p->'private'->>'address', ''),
    instructions    = coalesce(p->'private'->>'instructions', ''),
    phone           = coalesce(p->'private'->>'phone', ''),
    organizer_email = coalesce(p->'private'->>'organizerEmail', '')
  where board_id = m.board_id;
end $$;

create function public.meal_remove_signup(p_token text, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.meal_managers;
begin
  m := meal_private.manager_by_token(p_token);
  delete from public.meal_signups where board_id = m.board_id and id::text = p_id;
end $$;

create function public.meal_delete_board(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.meal_managers;
begin
  m := meal_private.manager_by_token(p_token);
  perform meal_private.check(m.role = 'owner', 'forbidden');
  delete from public.meal_boards where id = m.board_id;
end $$;

create function public.meal_add_manager(p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.meal_managers; tok text := meal_private.new_token();
begin
  m := meal_private.manager_by_token(p_token);
  perform meal_private.check(m.role = 'owner', 'forbidden');
  perform meal_private.check(char_length(btrim(coalesce(p_name, ''))) between 1 and 80, 'invalid');
  perform meal_private.check((select count(*) from public.meal_managers where board_id = m.board_id) < 10, 'invalid');
  insert into public.meal_managers (board_id, token, name, role) values (m.board_id, tok, btrim(p_name), 'co');
  return jsonb_build_object('token', tok);
end $$;

create function public.meal_remove_manager(p_token text, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.meal_managers;
begin
  m := meal_private.manager_by_token(p_token);
  perform meal_private.check(m.role = 'owner', 'forbidden');
  delete from public.meal_managers where board_id = m.board_id and id::text = p_id and role = 'co';
end $$;

create function public.meal_mark_seen(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.meal_managers set seen_at = now() where token = p_token;
  perform meal_private.check(found, 'not_found');
end $$;

-- ---------------------------------------------------------------- grants

revoke execute on all functions in schema meal_private from public;
revoke execute on function
  public.meal_create_board(jsonb), public.meal_get_public_board(text), public.meal_sign_up(text, jsonb),
  public.meal_get_my_signup(text), public.meal_update_my_signup(text, jsonb), public.meal_cancel_my_signup(text),
  public.meal_get_manage(text), public.meal_update_board(text, jsonb), public.meal_remove_signup(text, text),
  public.meal_delete_board(text), public.meal_add_manager(text, text), public.meal_remove_manager(text, text),
  public.meal_mark_seen(text)
from public;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on all functions in schema meal_private from %I', r);
      execute format($g$grant execute on function
        public.meal_create_board(jsonb), public.meal_get_public_board(text), public.meal_sign_up(text, jsonb),
        public.meal_get_my_signup(text), public.meal_update_my_signup(text, jsonb), public.meal_cancel_my_signup(text),
        public.meal_get_manage(text), public.meal_update_board(text, jsonb), public.meal_remove_signup(text, text),
        public.meal_delete_board(text), public.meal_add_manager(text, text), public.meal_remove_manager(text, text),
        public.meal_mark_seen(text)
      to %I$g$, r);
    end if;
  end loop;
end $$;
