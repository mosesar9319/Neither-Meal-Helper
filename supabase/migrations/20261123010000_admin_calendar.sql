-- The calendar (dates and which days are open) belongs to admins once a request is sent.
-- Organizers choose it when they send the request, and can change it again only if the
-- request was declined (to fix it and resend). Otherwise admins change it on the admin page.
-- No emails are sent for calendar changes.

-- The details keys that decide which days are open.
create function meal_private.calendar_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['skipShabbat', 'skipHolidays', 'inIsrael', 'manualBlocked', 'manualOpen'];
$$;

-- Only the calendar keys of a details object.
create function meal_private.calendar_details(d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(coalesce(d, '{}'::jsonb))
  where key = any(meal_private.calendar_keys());
$$;

-- Admins: change a board's dates and open/closed days.
-- p = {startDate, endDate, blockedDates, details: {skipShabbat, skipHolidays, inIsrael, manualBlocked, manualOpen}}
-- Sign-ups on days that close are kept (the admin page warns and can move them).
create function public.meal_admin_update_calendar(p_slug text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.meal_boards; d jsonb; s date; e date;
begin
  perform meal_private.require_admin();
  select * into b from public.meal_boards where slug = p_slug for update;
  perform meal_private.check(found, 'not_found');
  perform meal_private.check(jsonb_typeof(p) = 'object' and jsonb_typeof(p->'details') = 'object', 'invalid');
  d := p->'details';
  perform meal_private.check(
        jsonb_typeof(d->'skipShabbat') = 'boolean'
    and jsonb_typeof(d->'skipHolidays') = 'boolean'
    and jsonb_typeof(d->'inIsrael') = 'boolean'
    and jsonb_typeof(d->'manualBlocked') = 'array'
    and jsonb_typeof(d->'manualOpen') = 'array', 'invalid');
  -- Same rules as a new request, on the board as it would be after the change.
  perform meal_private.validate_board(
    meal_private.board_json(b)
    || jsonb_build_object('startDate', p->'startDate', 'endDate', p->'endDate', 'blockedDates', p->'blockedDates',
                          'details', b.details || meal_private.calendar_details(d), 'private', '{}'::jsonb));
  s := (p->>'startDate')::date;
  e := (p->>'endDate')::date;
  perform meal_private.check(not exists (
    select 1 from (select jsonb_array_elements(d->'manualBlocked') v
                   union all select jsonb_array_elements(d->'manualOpen')) x
    where not meal_private.date_ok(x.v) or (x.v #>> '{}')::date not between s and e), 'invalid');
  update public.meal_boards set
    start_date    = s,
    end_date      = e,
    blocked_dates = meal_private.json_dates(p->'blockedDates'),
    details       = details || meal_private.calendar_details(d),
    updated_at    = now()
  where id = b.id;
end $$;

revoke execute on function public.meal_admin_update_calendar(text, jsonb) from public;
revoke execute on function meal_private.calendar_keys(), meal_private.calendar_details(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.meal_admin_update_calendar(text, jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.meal_admin_update_calendar(text, jsonb) to authenticated;
  end if;
end $$;
