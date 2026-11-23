-- Admins can see, move and remove the meals people signed up for, on any board.
-- Admins only (the owner's choice). No emails are sent for these changes.

-- All sign-ups of one board, with contact details, for the admin page.
create function public.meal_admin_list_signups(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.meal_boards;
begin
  perform meal_private.require_admin();
  select * into b from public.meal_boards where slug = p_slug;
  perform meal_private.check(found, 'not_found');
  return coalesce((
    select jsonb_agg(meal_private.signup_json(s) order by s.meal_date, s.slot, s.created_at)
    from public.meal_signups s where s.board_id = b.id), '[]'::jsonb);
end $$;

-- Move a sign-up to another day and/or meal of the same board.
-- The target must be inside the board's dates and one of its meals. A full target
-- is refused with 'slot_full' unless p_force is true (the admin chose "move anyway").
-- The reminder is reset, so it goes out for the new day.
create function public.meal_admin_move_signup(p_id text, p_date text, p_slot text, p_force boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.meal_signups; b public.meal_boards; d date; taken int;
begin
  perform meal_private.require_admin();
  select * into s from public.meal_signups where id::text = p_id;
  perform meal_private.check(found, 'not_found');
  -- Lock the board so two moves can't both take the last place.
  select * into b from public.meal_boards where id = s.board_id for update;
  perform meal_private.check(meal_private.date_ok(to_jsonb(p_date)), 'invalid');
  d := p_date::date;
  perform meal_private.check(d between b.start_date and b.end_date and p_slot = any(b.slots), 'invalid');
  if d = s.meal_date and p_slot = s.slot then
    return;
  end if;
  select count(*) into taken from public.meal_signups
   where board_id = b.id and meal_date = d and slot = p_slot and id <> s.id;
  perform meal_private.check(coalesce(p_force, false) or taken < b.per_slot, 'slot_full');
  update public.meal_signups
     set meal_date = d, slot = p_slot, reminder_sent_at = null
   where id = s.id;
end $$;

create function public.meal_admin_remove_signup(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform meal_private.require_admin();
  delete from public.meal_signups where id::text = p_id;
  perform meal_private.check(found, 'not_found');
end $$;

revoke execute on function
  public.meal_admin_list_signups(text), public.meal_admin_move_signup(text, text, text, boolean),
  public.meal_admin_remove_signup(text)
from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function
      public.meal_admin_list_signups(text), public.meal_admin_move_signup(text, text, text, boolean),
      public.meal_admin_remove_signup(text)
    from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function
      public.meal_admin_list_signups(text), public.meal_admin_move_signup(text, text, text, boolean),
      public.meal_admin_remove_signup(text)
    to authenticated;
  end if;
end $$;
