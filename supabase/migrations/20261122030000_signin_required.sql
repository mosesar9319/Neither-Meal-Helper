-- Signing in is required to send a meal request or to sign up to cook.
-- Existing private links (organizer /m/…, neighbor /s/…) keep working without signing in.

create or replace function public.meal_create_board(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.meal_boards;
  tok text := meal_private.new_token();
begin
  perform meal_private.check(auth.uid() is not null, 'signin_required');
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
  perform meal_private.check(auth.uid() is not null, 'signin_required');
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

