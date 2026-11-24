-- Optional accounts: linking requests and sign-ups to the signed-in person.
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'dana@example.com', now()),
  ('00000000-0000-0000-0000-0000000000d2', 'yossi@example.com', now());

-- Visitors can't send requests or call the account functions. They CAN sign up to cook (no sign-in needed).
set role anon;
do $$
begin
  begin
    perform public.meal_create_board(jsonb_build_object(
      'familyName', 'Anon', 'startDate', current_date + 1, 'endDate', current_date + 3,
      'slots', '["dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb, 'details', '{}'::jsonb,
      'private', '{"address":"","instructions":"","phone":"","organizerEmail":""}'::jsonb));
    raise exception 'expected signin_required';
  exception when raise_exception then assert sqlerrm = 'signin_required', sqlerrm; end;
  begin
    perform public.meal_sign_up('whatever', '{}'::jsonb);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;
  begin
    perform public.meal_my_activity();
    raise exception 'anon could call meal_my_activity';
  exception when insufficient_privilege then null; end;
end $$;

-- A board from before sign-in was required: made by Yossi, then left without an owner.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2"}';
do $$
declare r jsonb;
begin
  r := public.meal_create_board(jsonb_build_object(
    'familyName', 'Legacy', 'startDate', current_date + 1, 'endDate', current_date + 3,
    'slots', '["dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb, 'details', '{}'::jsonb,
    'private', '{"address":"","instructions":"","phone":"","organizerEmail":""}'::jsonb));
  perform set_config('test.anon_slug', r->>'slug', false);
  perform set_config('test.anon_tok', r->>'manageToken', false);
end $$;
reset role;
update public.meal_boards set created_by = null where slug = current_setting('test.anon_slug');

-- Signed in as Dana: a request she sends is hers.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
do $$
declare r jsonb; a jsonb; edit text;
begin
  r := public.meal_create_board(jsonb_build_object(
    'familyName', 'Mine', 'startDate', current_date + 1, 'endDate', current_date + 3,
    'slots', '["dinner"]'::jsonb, 'perSlot', 2, 'blockedDates', '[]'::jsonb, 'details', '{}'::jsonb,
    'private', '{"address":"","instructions":"","phone":"","organizerEmail":"dana@example.com"}'::jsonb));
  a := public.meal_my_activity();
  assert jsonb_array_length(a->'boards') = 1, a::text;
  assert a->'boards'->0->>'familyName' = 'Mine';
  assert a->'boards'->0->>'status' = 'pending';
  assert a->'boards'->0->>'manageToken' = r->>'manageToken';

  -- Approved (as an admin would), then Dana signs up to cook on it.
  perform public.test_approve(r->>'slug');
  edit := public.meal_sign_up(r->>'slug', jsonb_build_object(
    'name', 'Dana', 'phone', '050', 'email', 'dana@example.com', 'dish', 'Soup', 'note', '',
    'date', current_date + 1, 'slot', 'dinner'))->>'editToken';
  a := public.meal_my_activity();
  assert jsonb_array_length(a->'signups') = 1;
  assert a->'signups'->0->>'editToken' = edit;
  assert a->'signups'->0->>'familyName' = 'Mine';
  perform set_config('test.mine_slug', r->>'slug', false);

  -- Linking needs the owner link; a wrong token links nothing.
  assert (public.meal_link_my_items(array['nope'], array[]::text[]))->>'boards' = '0';
  assert (public.meal_link_my_items(array[current_setting('test.anon_tok')], array[]::text[]))->>'boards' = '1';
  assert jsonb_array_length(public.meal_my_activity()->'boards') = 2;
  begin
    perform public.meal_link_my_items(array_fill('x'::text, array[51]), array[]::text[]);
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
end $$;

-- Yossi can't see Dana's items, and can't take over items she already linked.
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2"}';
do $$
declare a jsonb;
begin
  a := public.meal_my_activity();
  assert jsonb_array_length(a->'boards') = 0 and jsonb_array_length(a->'signups') = 0, a::text;
  assert (public.meal_link_my_items(array[current_setting('test.anon_tok')], array[]::text[]))->>'boards' = '0';
  raise notice 'ALL ACCOUNT TESTS PASSED';
end $$;
reset role;

-- A visitor who isn't signed in signs up to cook on an approved board.
reset role;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1"}';
set role authenticated;
select set_config('test.anon_slug', public.meal_create_board(jsonb_build_object(
  'familyName', 'AnonCook', 'startDate', current_date + 1, 'endDate', current_date + 3,
  'slots', '["dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb, 'details', '{}'::jsonb,
  'private', '{"address":"","instructions":"","phone":"","organizerEmail":""}'::jsonb))->>'slug', false);
reset role;
select public.test_approve(current_setting('test.anon_slug'));
set request.jwt.claims = '';
set role anon;
do $$
declare r jsonb;
begin
  r := public.meal_sign_up(current_setting('test.anon_slug'), jsonb_build_object(
    'name', 'Neighbor', 'phone', '050', 'email', 'neighbor@example.com', 'dish', '', 'note', '',
    'date', current_date + 1, 'slot', 'dinner'));
  assert r->>'editToken' is not null, r::text;
  raise notice 'ANONYMOUS COOK SIGN-UP WORKS';
end $$;
reset role;
