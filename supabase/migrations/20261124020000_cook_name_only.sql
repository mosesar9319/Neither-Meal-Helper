-- Cooks only have to give their name (2026-11-24, owner's request): phone and email are optional.
-- An email, if given, must look like one (it's used for the reminder the evening before).
-- Applies to signing up, a cook editing their own meal, and an admin editing a cook.

-- The table required a phone; now it may be empty (still at most 30 characters).
alter table public.meal_signups drop constraint meal_signups_phone_check;
alter table public.meal_signups add constraint meal_signups_phone_check check (char_length(phone) <= 30);
create or replace function meal_private.validate_contact(p jsonb) returns void
language plpgsql stable set search_path = '' as $$
begin
  perform meal_private.check(jsonb_typeof(p) = 'object', 'invalid');
  perform meal_private.check(
        meal_private.text_ok(p->'name', 80, true)
    and meal_private.text_ok(p->'phone', 30)
    and meal_private.text_ok(p->'email', 200)
    and (btrim(coalesce(p->>'email', '')) = '' or btrim(p->>'email') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    and meal_private.text_ok(p->'dish', 200)
    and meal_private.text_ok(p->'note', 500), 'invalid');
end $$;

-- Sign-up stores missing phone/email as empty text.
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
  values (b.id, d, sl, btrim(p->>'name'), coalesce(btrim(p->>'phone'), ''),
          lower(coalesce(btrim(p->>'email'), '')), coalesce(btrim(p->>'dish'), ''), coalesce(btrim(p->>'note'), ''), tok, auth.uid())
  returning id into new_id;

  select * into pr from public.meal_board_private where board_id = b.id;
  return jsonb_build_object('editToken', tok, 'signupId', new_id, 'private', meal_private.private_json(pr, false));
end $$;

create or replace function public.meal_update_my_signup(p_token text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform meal_private.validate_contact(p);
  update public.meal_signups set
    name = btrim(p->>'name'), phone = coalesce(btrim(p->>'phone'), ''),
    email = lower(coalesce(btrim(p->>'email'), '')), dish = coalesce(btrim(p->>'dish'), ''),
    note = coalesce(btrim(p->>'note'), '')
  where edit_token = p_token;
  perform meal_private.check(found, 'not_found');
end $$;

create or replace function public.meal_admin_update_signup(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform meal_private.require_admin();
  perform meal_private.validate_contact(p);
  update public.meal_signups set
    name  = btrim(p->>'name'),
    phone = coalesce(btrim(p->>'phone'), ''),
    email = lower(coalesce(btrim(p->>'email'), '')),
    dish  = coalesce(btrim(p->>'dish'), ''),
    note  = coalesce(btrim(p->>'note'), '')
  where id::text = p_id;
  perform meal_private.check(found, 'not_found');
end $$;
