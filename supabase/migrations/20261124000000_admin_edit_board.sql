-- Admins can fix or add anything on a board (family, food, meals, dates and days, private details)
-- and a cook's details (name, phone, email, dish, note). The board's status doesn't change.
-- No emails are sent.

create function public.meal_admin_update_board(p_slug text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.meal_boards;
begin
  perform meal_private.require_admin();
  select * into b from public.meal_boards where slug = p_slug for update;
  perform meal_private.check(found, 'not_found');
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
  where id = b.id;
  update public.meal_board_private set
    address         = coalesce(p->'private'->>'address', ''),
    instructions    = coalesce(p->'private'->>'instructions', ''),
    phone           = coalesce(p->'private'->>'phone', ''),
    organizer_email = coalesce(p->'private'->>'organizerEmail', '')
  where board_id = b.id;
end $$;

create function public.meal_admin_update_signup(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform meal_private.require_admin();
  perform meal_private.validate_contact(p);
  perform meal_private.check(btrim(coalesce(p->>'email', '')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'invalid');
  update public.meal_signups set
    name  = btrim(p->>'name'),
    phone = btrim(p->>'phone'),
    email = lower(btrim(p->>'email')),
    dish  = coalesce(btrim(p->>'dish'), ''),
    note  = coalesce(btrim(p->>'note'), '')
  where id::text = p_id;
  perform meal_private.check(found, 'not_found');
end $$;

revoke execute on function public.meal_admin_update_board(text, jsonb), public.meal_admin_update_signup(text, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.meal_admin_update_board(text, jsonb), public.meal_admin_update_signup(text, jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.meal_admin_update_board(text, jsonb), public.meal_admin_update_signup(text, jsonb) to authenticated;
  end if;
end $$;
