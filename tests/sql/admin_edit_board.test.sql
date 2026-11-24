-- Admins editing everything on a board, and a cook's details.
\set ON_ERROR_STOP on

reset role;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'edit-admin@example.com', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'edit-org@example.com', now());
insert into public.meal_admins (email) values ('edit-admin@example.com') on conflict do nothing;

set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2"}';
do $$
declare
  r jsonb; s text;
  board jsonb := jsonb_build_object(
    'familyName', 'Edit', 'startDate', current_date + 1, 'endDate', current_date + 5,
    'slots', '["dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb,
    'details', '{"organizerName":"Org","allergies":""}'::jsonb,
    'private', '{"address":"","instructions":"","phone":"","organizerEmail":""}'::jsonb);
begin
  r := public.meal_create_board(board);
  perform public.test_approve(r->>'slug');
  s := public.meal_sign_up(r->>'slug', jsonb_build_object('name', 'Ruth', 'phone', '050', 'email', 'ruth@example.com',
         'dish', '', 'note', '', 'date', current_date + 2, 'slot', 'dinner'))->>'signupId';
  perform set_config('test.eb_slug', r->>'slug', false);
  perform set_config('test.eb_tok', r->>'manageToken', false);
  perform set_config('test.eb_board', board::text, false);
  perform set_config('test.eb_signup', s, false);

  -- Not an admin.
  begin
    perform public.meal_admin_update_board(r->>'slug', board);
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
  begin
    perform public.meal_admin_update_signup(s, '{"name":"X","phone":"1","email":"x@example.com"}'::jsonb);
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
end $$;

reset role;
set request.jwt.claims = '';
set role anon;
do $$ begin
  begin
    perform public.meal_admin_update_board('x', '{}'::jsonb);
    raise exception 'anon could edit a board';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1"}';
do $$
declare
  slug text := current_setting('test.eb_slug');
  tok text := current_setting('test.eb_tok');
  board jsonb := current_setting('test.eb_board')::jsonb;
  sid text := current_setting('test.eb_signup');
  m jsonb; s jsonb;
begin
  -- Everything at once: name, food, meals, dates and days, private details. Status stays approved.
  perform public.meal_admin_update_board(slug, board || jsonb_build_object(
    'familyName', 'Edit family', 'endDate', current_date + 7, 'slots', '["lunch","dinner"]'::jsonb, 'perSlot', 2,
    'blockedDates', jsonb_build_array(current_date + 4),
    'details', '{"organizerName":"Org","allergies":"nuts"}'::jsonb,
    'private', '{"address":"5 Oak St","instructions":"Ring twice","phone":"052","organizerEmail":"org@example.com"}'::jsonb));
  m := public.meal_get_manage(tok);
  assert m->'board'->>'familyName' = 'Edit family', m::text;
  assert m->'board'->>'status' = 'approved', m::text;
  assert m->'board'->>'endDate' = (current_date + 7)::text, m::text;
  assert m->'board'->>'perSlot' = '2', m::text;
  assert m->'board'->'slots' = '["lunch","dinner"]'::jsonb, m::text;
  assert m->'board'->'blockedDates' = jsonb_build_array(current_date + 4), m::text;
  assert m->'board'->'details'->>'allergies' = 'nuts', m::text;
  assert m->'private'->>'address' = '5 Oak St' and m->'private'->>'organizerEmail' = 'org@example.com', m::text;

  -- Bad input is refused; a missing board is not found.
  begin
    perform public.meal_admin_update_board(slug, board || '{"familyName":" "}'::jsonb);
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_admin_update_board('nope', board);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;

  -- A cook's details.
  perform public.meal_admin_update_signup(sid, '{"name":"Ruth Levi","phone":"0501234567","email":"Ruth.Levi@Example.com","dish":"Soup","note":"after 6"}'::jsonb);
  select x into s from jsonb_array_elements(public.meal_admin_list_signups(slug)) x where x->>'id' = sid;
  assert s->>'name' = 'Ruth Levi' and s->>'phone' = '0501234567' and s->>'email' = 'ruth.levi@example.com', s::text;
  assert s->>'dish' = 'Soup' and s->>'note' = 'after 6', s::text;
  assert s->>'date' = (current_date + 2)::text, 'day unchanged';
  begin
    perform public.meal_admin_update_signup(sid, '{"name":"","phone":"1","email":"a@example.com"}'::jsonb);
    raise exception 'expected invalid (no name)';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_admin_update_signup(sid, '{"name":"A","phone":"1","email":"nope"}'::jsonb);
    raise exception 'expected invalid (email)';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_admin_update_signup('00000000-0000-0000-0000-000000000000', '{"name":"A","phone":"1","email":"a@example.com"}'::jsonb);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;

  raise notice 'ALL ADMIN EDIT BOARD TESTS PASSED';
end $$;
reset role;
