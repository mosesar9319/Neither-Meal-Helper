-- Admins moving and removing people's meals.
\set ON_ERROR_STOP on

reset role;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'boss@example.com', now()),
  ('00000000-0000-0000-0000-0000000000f2', 'cook@example.com', now());
insert into public.meal_admins (email) values ('boss@example.com') on conflict do nothing;

-- A cook (signed in, not an admin) requests a board and signs up twice.
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2"}';
do $$
declare r jsonb; slug text; s1 text; s2 text; c jsonb;
begin
  r := public.meal_create_board(jsonb_build_object(
    'familyName', 'Move', 'startDate', current_date + 1, 'endDate', current_date + 5,
    'slots', '["lunch","dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb, 'details', '{}'::jsonb,
    'private', '{"address":"","instructions":"","phone":"","organizerEmail":""}'::jsonb));
  slug := r->>'slug';
  perform public.test_approve(slug);
  c := '{"name":"Ruth","phone":"050","email":"ruth@example.com","dish":"","note":""}'::jsonb;
  s1 := public.meal_sign_up(slug, c || jsonb_build_object('date', current_date + 1, 'slot', 'dinner'))->>'signupId';
  s2 := public.meal_sign_up(slug, c || jsonb_build_object('date', current_date + 2, 'slot', 'dinner'))->>'signupId';
  perform set_config('test.ms_slug', slug, false);
  perform set_config('test.ms_s1', s1, false);
  perform set_config('test.ms_s2', s2, false);

  -- Not an admin: none of the admin actions work.
  begin
    perform public.meal_admin_list_signups(slug);
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
  begin
    perform public.meal_admin_move_signup(s1, (current_date + 3)::text, 'dinner', false);
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
  begin
    perform public.meal_admin_remove_signup(s1);
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
end $$;

-- Visitors can't call them at all.
reset role;
set request.jwt.claims = '';
set role anon;
do $$ begin
  begin
    perform public.meal_admin_list_signups('x');
    raise exception 'anon could list sign-ups';
  exception when insufficient_privilege then null; end;
end $$;

-- The admin.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1"}';
do $$
declare
  slug text := current_setting('test.ms_slug');
  s1 text := current_setting('test.ms_s1');
  s2 text := current_setting('test.ms_s2');
  list jsonb;
begin
  list := public.meal_admin_list_signups(slug);
  assert jsonb_array_length(list) = 2, list::text;
  assert list->0->>'phone' = '050', 'admin sees contact details';

  -- Move to a free day and a different meal.
  perform public.meal_admin_move_signup(s1, (current_date + 3)::text, 'lunch', false);
  assert exists (select 1 from jsonb_array_elements(public.meal_admin_list_signups(slug)) x
                 where x->>'id' = s1 and x->>'date' = (current_date + 3)::text and x->>'slot' = 'lunch');

  -- Moving onto a full meal is refused, unless forced.
  begin
    perform public.meal_admin_move_signup(s1, (current_date + 2)::text, 'dinner', false);
    raise exception 'expected slot_full';
  exception when raise_exception then assert sqlerrm = 'slot_full', sqlerrm; end;
  perform public.meal_admin_move_signup(s1, (current_date + 2)::text, 'dinner', true);
  assert (select count(*) from jsonb_array_elements(public.meal_admin_list_signups(slug)) x
          where x->>'date' = (current_date + 2)::text and x->>'slot' = 'dinner') = 2;

  -- Outside the board's dates, or a meal the board doesn't have: refused.
  begin
    perform public.meal_admin_move_signup(s1, (current_date + 30)::text, 'dinner', true);
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_admin_move_signup(s1, (current_date + 3)::text, 'breakfast', true);
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;

  -- Remove.
  perform public.meal_admin_remove_signup(s1);
  assert jsonb_array_length(public.meal_admin_list_signups(slug)) = 1;
  begin
    perform public.meal_admin_remove_signup(s1);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;

end $$;

-- A moved meal gets its reminder again for the new day.
reset role;
update public.meal_signups set reminder_sent_at = now() where id::text = current_setting('test.ms_s2');
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1"}';
select public.meal_admin_move_signup(current_setting('test.ms_s2'), (current_date + 4)::text, 'dinner', false);
reset role;
do $$ begin
  assert (select reminder_sent_at from public.meal_signups where id::text = current_setting('test.ms_s2')) is null,
    'reminder not reset';
  raise notice 'ALL ADMIN SIGN-UP EDIT TESTS PASSED';
end $$;
