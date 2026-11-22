-- Optional accounts (Continue with Google) for organizers and neighbors.
--
--   * Using the site without signing in works exactly as before: the private
--     links (/m/…, /s/…) remain the credentials.
--   * When someone is signed in, the requests they send and the meals they sign
--     up for are linked to their account, so "my requests and my meals" shows
--     them on any device.
--   * Signing in can also link items saved on this device, but only for links the
--     person already holds (a manage or edit token).

alter table public.meal_boards add column created_by uuid references auth.users(id) on delete set null;
alter table public.meal_signups add column user_id uuid references auth.users(id) on delete set null;
create index meal_boards_created_by_idx on public.meal_boards (created_by) where created_by is not null;
create index meal_signups_user_idx on public.meal_signups (user_id) where user_id is not null;

-- New requests remember who sent them, when signed in (auth.uid() is null otherwise).
create or replace function public.meal_create_board(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.meal_boards;
  tok text := meal_private.new_token();
begin
  perform meal_private.validate_board(p);
  insert into public.meal_boards (slug, family_name, start_date, end_date, slots, per_slot, blocked_dates, details, created_by)
  values (
    meal_private.new_slug(),
    btrim(p->>'familyName'),
    (p->>'startDate')::date,
    (p->>'endDate')::date,
    meal_private.json_texts(p->'slots'),
    (p->>'perSlot')::int,
    meal_private.json_dates(p->'blockedDates'),
    p->'details',
    auth.uid()
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

-- Sign-ups remember who made them, when signed in.
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

  insert into public.meal_signups (board_id, meal_date, slot, name, phone, email, dish, note, edit_token, user_id)
  values (b.id, d, sl, btrim(p->>'name'), btrim(p->>'phone'),
          lower(btrim(p->>'email')), coalesce(btrim(p->>'dish'), ''), coalesce(btrim(p->>'note'), ''), tok, auth.uid())
  returning id into new_id;

  select * into pr from public.meal_board_private where board_id = b.id;
  return jsonb_build_object('editToken', tok, 'signupId', new_id, 'private', meal_private.private_json(pr, false));
end $$;

-- "My requests and my meals" for the signed-in person.
create function public.meal_my_activity() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform meal_private.check(uid is not null, 'forbidden');
  return jsonb_build_object(
    'boards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', b.slug, 'familyName', b.family_name, 'status', b.status,
               'startDate', b.start_date, 'endDate', b.end_date, 'createdAt', b.created_at,
               'manageToken', (select m.token from public.meal_managers m where m.board_id = b.id and m.role = 'owner' limit 1))
             order by b.start_date desc, b.created_at desc)
      from public.meal_boards b where b.created_by = uid), '[]'::jsonb),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', s.meal_date, 'slot', s.slot, 'dish', s.dish, 'editToken', s.edit_token,
               'familyName', b.family_name, 'slug', b.slug)
             order by s.meal_date desc)
      from public.meal_signups s join public.meal_boards b on b.id = s.board_id
      where s.user_id = uid), '[]'::jsonb));
end $$;

-- Link items this person already holds links to (saved on their device) to their account.
-- Only unclaimed items are linked, and only the board's owner link counts.
create function public.meal_link_my_items(p_manage_tokens text[], p_edit_tokens text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); nb int; ns int;
begin
  perform meal_private.check(uid is not null, 'forbidden');
  perform meal_private.check(coalesce(cardinality(p_manage_tokens), 0) <= 50 and coalesce(cardinality(p_edit_tokens), 0) <= 50, 'invalid');
  update public.meal_boards b set created_by = uid
  where b.created_by is null
    and exists (select 1 from public.meal_managers m
                where m.board_id = b.id and m.role = 'owner' and m.token = any(coalesce(p_manage_tokens, '{}')));
  get diagnostics nb = row_count;
  update public.meal_signups s set user_id = uid
  where s.user_id is null and s.edit_token = any(coalesce(p_edit_tokens, '{}'));
  get diagnostics ns = row_count;
  return jsonb_build_object('boards', nb, 'signups', ns);
end $$;

revoke execute on function public.meal_my_activity(), public.meal_link_my_items(text[], text[]) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.meal_my_activity(), public.meal_link_my_items(text[], text[]) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.meal_my_activity(), public.meal_link_my_items(text[], text[]) to authenticated;
  end if;
end $$;
