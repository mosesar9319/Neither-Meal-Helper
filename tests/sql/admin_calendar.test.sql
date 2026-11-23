-- The calendar is the admins' once a request is sent (organizers may change it only when declined).
\set ON_ERROR_STOP on

reset role;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'cal-admin@example.com', now()),
  ('00000000-0000-0000-0000-0000000000c2', 'cal-org@example.com', now());
insert into public.meal_admins (email) values ('cal-admin@example.com') on conflict do nothing;

-- The organizer sends a request, then tries to change its dates while it waits.
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
do $$
declare
  r jsonb; tok text; m jsonb;
  board jsonb := jsonb_build_object(
    'familyName', 'Cal', 'startDate', current_date + 1, 'endDate', current_date + 6,
    'slots', '["dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', jsonb_build_array(current_date + 2),
    'details', jsonb_build_object('organizerName', 'Org', 'allergies', '', 'skipShabbat', false, 'skipHolidays', false,
                                  'inIsrael', true, 'manualBlocked', jsonb_build_array(current_date + 2), 'manualOpen', '[]'::jsonb),
    'private', '{"address":"","instructions":"","phone":"","organizerEmail":""}'::jsonb);
begin
  r := public.meal_create_board(board);
  tok := r->>'manageToken';
  perform set_config('test.cal_slug', r->>'slug', false);
  perform set_config('test.cal_tok', tok, false);
  perform set_config('test.cal_board', board::text, false);

  -- Pending: other details change, the calendar doesn't.
  perform public.meal_update_board(tok, board
    || jsonb_build_object('familyName', 'Cal family', 'endDate', current_date + 9, 'blockedDates', '[]'::jsonb,
                          'details', (board->'details') || jsonb_build_object('allergies', 'nuts', 'manualBlocked', '[]'::jsonb, 'skipShabbat', true)));
  m := public.meal_get_manage(tok)->'board';
  assert m->>'familyName' = 'Cal family', m::text;
  assert m->'details'->>'allergies' = 'nuts', m::text;
  assert m->>'endDate' = (current_date + 6)::text, 'end date must stay: ' || m::text;
  assert m->'blockedDates' = jsonb_build_array(current_date + 2), m::text;
  assert m->'details'->'manualBlocked' = jsonb_build_array(current_date + 2), m::text;
  assert m->'details'->>'skipShabbat' = 'false', m::text;

  -- Not an admin: can't use the admin calendar edit.
  begin
    perform public.meal_admin_update_calendar(r->>'slug', jsonb_build_object(
      'startDate', current_date + 1, 'endDate', current_date + 6, 'blockedDates', '[]'::jsonb,
      'details', '{"skipShabbat":false,"skipHolidays":false,"inIsrael":true,"manualBlocked":[],"manualOpen":[]}'::jsonb));
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
end $$;

reset role;
set request.jwt.claims = '';
set role anon;
do $$ begin
  begin
    perform public.meal_admin_update_calendar('x', '{}'::jsonb);
    raise exception 'anon could edit a calendar';
  exception when insufficient_privilege then null; end;
end $$;

-- The admin declines it: now the organizer may change the dates again (and it goes back to pending).
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select public.meal_admin_review(current_setting('test.cal_slug'), 'declined', 'Please fix the dates');

set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
do $$
declare
  tok text := current_setting('test.cal_tok');
  board jsonb := current_setting('test.cal_board')::jsonb;
  m jsonb;
begin
  perform public.meal_update_board(tok, board
    || jsonb_build_object('endDate', current_date + 8, 'blockedDates', '[]'::jsonb,
                          'details', (board->'details') || '{"manualBlocked":[]}'::jsonb));
  m := public.meal_get_manage(tok)->'board';
  assert m->>'status' = 'pending', m::text;
  assert m->>'endDate' = (current_date + 8)::text, m::text;
  assert m->'blockedDates' = '[]'::jsonb, m::text;
end $$;

-- Approved, someone signs up; then the admin changes the calendar.
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select public.meal_admin_review(current_setting('test.cal_slug'), 'approved', '');
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select public.meal_sign_up(current_setting('test.cal_slug'),
  jsonb_build_object('name', 'Ruth', 'phone', '050', 'email', 'ruth@example.com', 'dish', '', 'note', '',
                     'date', current_date + 3, 'slot', 'dinner'));

set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
do $$
declare
  slug text := current_setting('test.cal_slug');
  tok text := current_setting('test.cal_tok');
  cal jsonb := jsonb_build_object(
    'startDate', current_date + 2, 'endDate', current_date + 12, 'blockedDates', jsonb_build_array(current_date + 3),
    'details', jsonb_build_object('skipShabbat', false, 'skipHolidays', false, 'inIsrael', true,
                                  'manualBlocked', jsonb_build_array(current_date + 3), 'manualOpen', '[]'::jsonb));
  m jsonb;
begin
  perform public.meal_admin_update_calendar(slug, cal);
  m := public.meal_get_manage(tok)->'board';
  assert m->>'startDate' = (current_date + 2)::text, m::text;
  assert m->>'endDate' = (current_date + 12)::text, m::text;
  assert m->'blockedDates' = jsonb_build_array(current_date + 3), m::text;
  assert m->'details'->'manualBlocked' = jsonb_build_array(current_date + 3), m::text;
  assert m->'details'->>'organizerName' = 'Org', 'other details are kept: ' || m::text;
  assert m->>'status' = 'approved', m::text;
  -- The person on the day that closed is kept (the admin can move or remove them).
  assert jsonb_array_length(public.meal_admin_list_signups(slug)) = 1;

  -- Bad input is refused.
  begin
    perform public.meal_admin_update_calendar(slug, cal || jsonb_build_object('endDate', current_date));
    raise exception 'expected invalid (end before start)';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_admin_update_calendar(slug, cal || jsonb_build_object('blockedDates', jsonb_build_array(current_date + 40)));
    raise exception 'expected invalid (closed day outside dates)';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_admin_update_calendar(slug, cal || jsonb_build_object('details',
      (cal->'details') || jsonb_build_object('manualOpen', jsonb_build_array(current_date + 40))));
    raise exception 'expected invalid (reopened day outside dates)';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_admin_update_calendar(slug, cal || '{"details":{"skipShabbat":"yes"}}'::jsonb);
    raise exception 'expected invalid (bad details)';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_admin_update_calendar('nope', cal);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;

  -- After approval the organizer still can't change the calendar.
  perform public.meal_update_board(tok, current_setting('test.cal_board')::jsonb);
  m := public.meal_get_manage(tok)->'board';
  assert m->>'endDate' = (current_date + 12)::text, m::text;

  raise notice 'ALL ADMIN CALENDAR TESTS PASSED';
end $$;
reset role;
