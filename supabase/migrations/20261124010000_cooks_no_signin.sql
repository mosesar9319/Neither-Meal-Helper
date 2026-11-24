-- Cooks don't need to sign in to take a meal (2026-11-24).
-- Requiring it stopped neighbors from signing up: they open the board from WhatsApp, the
-- emailed sign-in link opens in another browser (so it can't finish), and Google's screen shows
-- the database's address instead of the site's. They already give a name, phone and email.
-- Signing in stays optional (a signed-in cook's meal is linked to their account), and sending a
-- meal request still requires it (meal_create_board is unchanged).

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
