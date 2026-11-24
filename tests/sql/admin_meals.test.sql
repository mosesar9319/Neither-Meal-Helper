-- The admins' "all meals" list.
\set ON_ERROR_STOP on

reset role;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'meals-admin@example.com', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'meals-org@example.com', now());
insert into public.meal_admins (email) values ('meals-admin@example.com') on conflict do nothing;

-- Two approved boards and one pending board, with meals on them.
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2"}';
do $$
declare
  a text; b text; p text;
  board jsonb := jsonb_build_object(
    'familyName', 'AllMealsA', 'startDate', current_date + 1, 'endDate', current_date + 5,
    'slots', '["lunch","dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb, 'details', '{}'::jsonb,
    'private', '{"address":"","instructions":"","phone":"","organizerEmail":""}'::jsonb);
  c jsonb := '{"name":"Cook","phone":"050","email":"cook-all@example.com","dish":"Rice","note":""}'::jsonb;
begin
  a := public.meal_create_board(board)->>'slug';
  b := public.meal_create_board(board || '{"familyName":"AllMealsB"}')->>'slug';
  p := public.meal_create_board(board || '{"familyName":"AllMealsPending"}')->>'slug';
  perform public.test_approve(a);
  perform public.test_approve(b);
  perform public.meal_sign_up(a, c || jsonb_build_object('date', current_date + 2, 'slot', 'dinner'));
  perform public.meal_sign_up(b, c || jsonb_build_object('date', current_date + 1, 'slot', 'dinner'));
  perform public.meal_sign_up(a, c || jsonb_build_object('date', current_date + 2, 'slot', 'lunch'));
  perform set_config('test.am_pending', p, false);

  -- Not an admin.
  begin
    perform public.meal_admin_list_meals(false);
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
end $$;

-- A meal in the past on board A (as the owner: sign-up rules don't allow past days).
reset role;
insert into public.meal_signups (board_id, meal_date, slot, name, phone, email, dish, note, edit_token)
select id, current_date - 1, 'dinner', 'Past cook', '051', 'past@example.com', '', '', 'past-token-allmeals'
from public.meal_boards where family_name = 'AllMealsA';
update public.meal_boards set start_date = current_date - 1 where family_name = 'AllMealsA';

set role anon;
do $$ begin
  begin
    perform public.meal_admin_list_meals(false);
    raise exception 'anon could list meals';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
do $$
declare list jsonb; mine jsonb;
begin
  list := public.meal_admin_list_meals(false);
  select jsonb_agg(x) into mine from jsonb_array_elements(list) x where x->'board'->>'familyName' like 'AllMeals%';
  -- Upcoming meals only, from approved boards, by date then breakfast/lunch/dinner.
  assert jsonb_array_length(mine) = 3, mine::text;
  assert mine->0->'board'->>'familyName' = 'AllMealsB', mine::text;
  assert mine->1->>'slot' = 'lunch' and mine->2->>'slot' = 'dinner', mine::text;
  assert mine->0->>'email' = 'cook-all@example.com' and mine->0->>'phone' = '050', 'admin sees contact details';
  assert mine->0->'board'->>'slug' is not null and mine->0->'board'->'slots' is not null;
  assert not exists (select 1 from jsonb_array_elements(mine) x where x->'board'->>'slug' = current_setting('test.am_pending'));

  -- With past meals.
  select jsonb_agg(x) into mine from jsonb_array_elements(public.meal_admin_list_meals(true)) x
   where x->'board'->>'familyName' like 'AllMeals%';
  assert jsonb_array_length(mine) = 4, mine::text;
  assert mine->0->>'name' = 'Past cook', mine::text;

  raise notice 'ALL ADMIN MEALS LIST TESTS PASSED';
end $$;
reset role;
