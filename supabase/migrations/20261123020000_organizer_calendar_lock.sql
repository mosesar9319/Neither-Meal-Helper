-- Once a request is sent, organizers no longer change its calendar (dates and open/closed days);
-- admins do, with meal_admin_update_calendar. A declined request can still be fixed and resent.
-- Applied live together with the site change that hides the organizer's calendar editor.

-- Organizers: everything as before, but the calendar is kept as it is unless the request was declined.
create or replace function public.meal_update_board(p_token text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.meal_managers; b public.meal_boards; locked boolean;
begin
  m := meal_private.manager_by_token(p_token);
  perform meal_private.validate_board(p);
  select * into b from public.meal_boards where id = m.board_id for update;
  locked := b.status <> 'declined';
  update public.meal_boards set
    family_name   = btrim(p->>'familyName'),
    start_date    = case when locked then b.start_date else (p->>'startDate')::date end,
    end_date      = case when locked then b.end_date else (p->>'endDate')::date end,
    slots         = meal_private.json_texts(p->'slots'),
    per_slot      = (p->>'perSlot')::int,
    blocked_dates = case when locked then b.blocked_dates else meal_private.json_dates(p->'blockedDates') end,
    details       = case when locked then (p->'details') || meal_private.calendar_details(b.details) else p->'details' end,
    updated_at    = now(),
    status        = case when status = 'declined' then 'pending' else status end,
    admins_notified_at = case when status = 'declined' then null else admins_notified_at end
  where id = b.id;
  update public.meal_board_private set
    address         = coalesce(p->'private'->>'address', ''),
    instructions    = coalesce(p->'private'->>'instructions', ''),
    phone           = coalesce(p->'private'->>'phone', ''),
    organizer_email = coalesce(p->'private'->>'organizerEmail', '')
  where board_id = b.id;
end $$;
