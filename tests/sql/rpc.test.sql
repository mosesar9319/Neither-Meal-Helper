-- Run with scripts/test-db.sh against an empty Postgres database.
\set ON_ERROR_STOP on
set role anon;

-- Browser role cannot read tables directly.
do $$ begin
  begin
    perform 1 from public.meal_board_private;
    raise exception 'anon could read board_private';
  exception when insufficient_privilege then null;
  end;
  begin
    perform meal_private.new_token();
    raise exception 'anon could call meal_private';
  exception when insufficient_privilege then null;
  end;
end $$;


-- Requesting and signing up need a signed-in user (since 2026-11-22).
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000e1', 'organizer@example.com', now());
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1"}';

do $$
declare
  r jsonb; slug text; tok text; edit text; edit2 text; co text; pub jsonb; m jsonb;
  start date := current_date + 1;
  board jsonb := jsonb_build_object(
    'familyName', 'Cohen', 'startDate', start, 'endDate', start + 6,
    'slots', '["lunch","dinner"]'::jsonb, 'perSlot', 1,
    'blockedDates', jsonb_build_array(start + 2),
    'details', '{"organizerName":"Dana","adults":2}'::jsonb,
    'private', '{"address":"12 Oak St","instructions":"Ring twice","phone":"050-1234567","organizerEmail":"dana@example.com"}'::jsonb);
  contact jsonb := '{"name":"Rivka Levi","phone":"052-0000000","email":"rivka@example.com","dish":"Soup","note":""}'::jsonb;
begin
  r := public.meal_create_board(board);
  slug := r->>'slug'; tok := r->>'manageToken';
  assert length(slug) = 12 and length(tok) = 24, 'tokens';

  perform public.test_approve(slug);
  pub := public.meal_get_public_board(slug);
  assert pub->'board'->>'familyName' = 'Cohen';
  assert not (pub::text like '%Oak St%') and not (pub::text like '%050-%') and not (pub::text like '%dana@%'), 'public board leaks private data';

  r := public.meal_sign_up(slug, contact || jsonb_build_object('date', start, 'slot', 'dinner'));
  edit := r->>'editToken';
  assert r->'private'->>'address' = '12 Oak St', 'volunteer sees address';
  assert not (r::text like '%dana@%'), 'volunteer must not see organizer email';

  -- Same slot again is full.
  begin
    perform public.meal_sign_up(slug, contact || jsonb_build_object('date', start, 'slot', 'dinner'));
    raise exception 'expected slot_full';
  exception when raise_exception then assert sqlerrm = 'slot_full', sqlerrm; end;
  -- Closed day, slot not offered, out of range.
  begin
    perform public.meal_sign_up(slug, contact || jsonb_build_object('date', start + 2, 'slot', 'lunch'));
    raise exception 'expected day_closed';
  exception when raise_exception then assert sqlerrm = 'day_closed', sqlerrm; end;
  begin
    perform public.meal_sign_up(slug, contact || jsonb_build_object('date', start, 'slot', 'breakfast'));
    raise exception 'expected day_closed';
  exception when raise_exception then assert sqlerrm = 'day_closed', sqlerrm; end;
  begin
    perform public.meal_sign_up(slug, contact || jsonb_build_object('date', start + 30, 'slot', 'lunch'));
    raise exception 'expected day_closed';
  exception when raise_exception then assert sqlerrm = 'day_closed', sqlerrm; end;
  -- Missing phone is rejected.
  begin
    perform public.meal_sign_up(slug, (contact - 'phone') || jsonb_build_object('date', start, 'slot', 'lunch'));
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;

  edit2 := public.meal_sign_up(slug, contact || jsonb_build_object('date', start, 'slot', 'lunch'))->>'editToken';

  pub := public.meal_get_public_board(slug);
  assert jsonb_array_length(pub->'signups') = 2;
  assert pub->'signups'->0->>'name' = 'Rivka', 'first name only';
  assert not (pub::text like '%052-%'), 'public board leaks volunteer phone';

  -- Volunteer edits and cancels their own sign-up.
  perform public.meal_update_my_signup(edit, contact || '{"dish":"Lasagna"}');
  assert public.meal_get_my_signup(edit)->'signup'->>'dish' = 'Lasagna';
  perform public.meal_cancel_my_signup(edit2);
  begin
    perform public.meal_get_my_signup(edit2);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;

  -- Manager view.
  m := public.meal_get_manage(tok);
  assert m->'private'->>'organizerEmail' = 'dana@example.com';
  assert jsonb_array_length(m->'signups') = 1 and m->'signups'->0->>'phone' = '052-0000000';
  assert m->'me'->>'role' = 'owner';
  begin
    perform public.meal_get_manage('nope');
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;

  -- Co-organizer can manage but not delete or add others.
  co := public.meal_add_manager(tok, 'Yossi')->>'token';
  assert public.meal_get_manage(co)->'me'->>'role' = 'co';
  perform public.meal_update_board(co, board || '{"familyName":"Cohen family","perSlot":2}');
  assert public.meal_get_public_board(slug)->'board'->>'familyName' = 'Cohen family';
  begin
    perform public.meal_delete_board(co);
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
  begin
    perform public.meal_add_manager(co, 'X');
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;

  -- perSlot is now 2, so the dinner slot has room again.
  perform public.meal_sign_up(slug, contact || jsonb_build_object('date', start, 'slot', 'dinner'));

  -- Bad board input.
  begin
    perform public.meal_create_board(board || jsonb_build_object('endDate', start - 1));
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_create_board(board || '{"slots":["supper"]}');
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_create_board(board || jsonb_build_object('blockedDates', jsonb_build_array(start + 40)));
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;

  -- Signups and managers go when the owner deletes the board.
  perform public.meal_remove_manager(tok, (select x->>'id' from jsonb_array_elements(public.meal_get_manage(tok)->'managers') x where x->>'role' = 'co'));
  begin
    perform public.meal_get_manage(co);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;
  perform public.meal_mark_seen(tok);
  perform public.meal_delete_board(tok);
  begin
    perform public.meal_get_public_board(slug);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;
  begin
    perform public.meal_get_my_signup(edit);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;

  raise notice 'ALL DATABASE TESTS PASSED';
end $$;

-- ---------------------------------------------------------------- organizer lookup (recover links)
reset role;
do $$
declare s1 text; s2 text; b1 uuid; b2 uuid;
begin
  s1 := public.meal_create_board(jsonb_build_object(
    'familyName', 'A', 'startDate', current_date + 1, 'endDate', current_date + 2,
    'slots', '["dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb, 'details', '{}'::jsonb,
    'private', '{"address":"","instructions":"","phone":"","organizerEmail":"Dana_Levi@Example.com"}'::jsonb))->>'slug';
  s2 := public.meal_create_board(jsonb_build_object(
    'familyName', 'B', 'startDate', current_date + 1, 'endDate', current_date + 2,
    'slots', '["dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb, 'details', '{}'::jsonb,
    'private', '{"address":"","instructions":"","phone":"","organizerEmail":"danaxlevi@example.com"}'::jsonb))->>'slug';
  select id into b1 from public.meal_boards where slug = s1;
  select id into b2 from public.meal_boards where slug = s2;
  -- Case-insensitive exact match.
  assert (select array_agg(board_id) from public.meal_organizer_board_ids(' dana_levi@example.com ')) = array[b1];
  -- "_" and "%" are not wildcards.
  assert not exists (select 1 from public.meal_organizer_board_ids('dana%levi@example.com'));
  assert (select count(*) from public.meal_organizer_board_ids('dana_levi@example.com')) = 1;
  assert not exists (select 1 from public.meal_organizer_board_ids(''));
  raise notice 'ORGANIZER LOOKUP TESTS PASSED';
end $$;
set role anon;
do $$ begin
  begin
    perform public.meal_organizer_board_ids('x@example.com');
    raise exception 'anon could call meal_organizer_board_ids';
  exception when insufficient_privilege then null;
  end;
end $$;
