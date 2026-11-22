-- Optional accounts: linking requests and sign-ups to the signed-in person.
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'dana@example.com', now()),
  ('00000000-0000-0000-0000-0000000000d2', 'yossi@example.com', now());

-- Anonymous request: no owner; anonymous visitors can't call the account functions.
set role anon;
do $$
declare r jsonb;
begin
  r := public.meal_create_board(jsonb_build_object(
    'familyName', 'Anon', 'startDate', current_date + 1, 'endDate', current_date + 3,
    'slots', '["dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb, 'details', '{}'::jsonb,
    'private', '{"address":"","instructions":"","phone":"","organizerEmail":""}'::jsonb));
  perform set_config('test.anon_slug', r->>'slug', false);
  perform set_config('test.anon_tok', r->>'manageToken', false);
  begin
    perform public.meal_my_activity();
    raise exception 'anon could call meal_my_activity';
  exception when insufficient_privilege then null; end;
end $$;

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
