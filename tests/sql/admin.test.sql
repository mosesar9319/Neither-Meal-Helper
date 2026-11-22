-- Approval flow and admin rules. Run by scripts/test-db.sh after the migrations.
\set ON_ERROR_STOP on

-- Users: an admin (confirmed email, mixed case), an ordinary signed-in user, and a
-- user whose email is on the admin list but was never confirmed.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin@Example.com', now()),
  ('00000000-0000-0000-0000-00000000000b', 'someone@example.com', now()),
  ('00000000-0000-0000-0000-00000000000c', 'second@example.com', null);
insert into public.meal_admins (email) values ('admin@example.com'), ('second@example.com');

-- ---------------------------------------------------------------- as a visitor
set role anon;
do $$
declare
  r jsonb; slug text; tok text;
  start date := current_date + 1;
  board jsonb := jsonb_build_object(
    'familyName', 'Levi', 'startDate', start, 'endDate', start + 3,
    'slots', '["dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb,
    'details', '{"organizerName":"Dana"}'::jsonb,
    'private', '{"address":"1 Elm St","instructions":"","phone":"050","organizerEmail":"dana@example.com"}'::jsonb);
  contact jsonb := jsonb_build_object('name', 'Rivka', 'phone', '052', 'email', 'rivka@example.com', 'dish', '', 'note', '', 'date', start, 'slot', 'dinner');
begin
  r := public.meal_create_board(board);
  slug := r->>'slug'; tok := r->>'manageToken';
  perform set_config('test.slug', slug, false);
  perform set_config('test.tok', tok, false);
  perform set_config('test.contact', contact::text, false);

  -- A new request is pending: its organizer sees it, the public does not.
  assert public.meal_get_manage(tok)->'board'->>'status' = 'pending';
  begin
    perform public.meal_get_public_board(slug);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;
  begin
    perform public.meal_sign_up(slug, contact);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;

  -- Visitors may ask whether an email can sign in, and nothing else.
  assert public.meal_admin_login_allowed(' ADMIN@example.com ') = true;
  assert public.meal_admin_login_allowed('someone@example.com') = false;
  begin
    perform public.meal_admin_list_requests('pending');
    raise exception 'anon could list requests';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- signed in, not an admin
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (public.meal_admin_me()->>'isAdmin')::boolean = false;
  begin
    perform public.meal_admin_review(current_setting('test.slug'), 'approved', '');
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
  begin
    perform public.meal_admin_add('me@example.com');
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
end $$;

-- Listed email but never confirmed: still not an admin.
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c"}';
do $$
begin
  assert (public.meal_admin_me()->>'isAdmin')::boolean = false;
  begin
    perform public.meal_admin_list_requests('pending');
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
end $$;

-- ---------------------------------------------------------------- the admin
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
do $$
declare
  slug text := current_setting('test.slug');
  tok text := current_setting('test.tok');
  contact jsonb := current_setting('test.contact')::jsonb;
  list jsonb; edit text;
begin
  assert public.meal_admin_me()->>'email' = 'admin@example.com';
  assert (public.meal_admin_me()->>'isAdmin')::boolean;

  -- The admin sees the request with its private details and the organizer's link.
  -- Other test files may have added requests; look at this one.
  select x into list from jsonb_array_elements(public.meal_admin_list_requests('pending')) x where x->>'slug' = slug;
  assert list is not null;
  assert list->'private'->>'address' = '1 Elm St';
  assert list->'private'->>'organizerEmail' = 'dana@example.com';
  assert list->>'manageToken' = tok;
  begin
    perform public.meal_admin_list_requests('everything');
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;

  -- Decline with a note; the organizer sees the note, the board stays hidden.
  perform public.meal_admin_review(slug, 'declined', 'Please add the delivery address');
  assert public.meal_get_manage(tok)->'board'->>'status' = 'declined';
  assert public.meal_get_manage(tok)->'board'->>'reviewNote' = 'Please add the delivery address';
  begin
    perform public.meal_get_public_board(slug);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;

  -- The organizer edits a declined request, which sends it back for review.
  perform public.meal_update_board(tok, jsonb_build_object(
    'familyName', 'Levi', 'startDate', current_date + 1, 'endDate', current_date + 4,
    'slots', '["dinner"]'::jsonb, 'perSlot', 1, 'blockedDates', '[]'::jsonb,
    'details', '{"organizerName":"Dana"}'::jsonb,
    'private', '{"address":"1 Elm St, Apt 2","instructions":"","phone":"050","organizerEmail":"dana@example.com"}'::jsonb));
  assert public.meal_get_manage(tok)->'board'->>'status' = 'pending';

  -- Approve: now public, and neighbors can sign up.
  perform public.meal_admin_review(slug, 'approved', '');
  assert public.meal_get_public_board(slug)->'board'->>'status' = 'approved';
  assert exists (select 1 from jsonb_array_elements(public.meal_admin_list_requests('approved')) x where x->>'slug' = slug);
  assert not exists (select 1 from jsonb_array_elements(public.meal_admin_list_requests('pending')) x where x->>'slug' = slug);

  -- Sign-ups need a valid email.
  begin
    perform public.meal_sign_up(slug, contact || '{"email":""}');
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_sign_up(slug, contact || '{"email":"not-an-email"}');
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  edit := public.meal_sign_up(slug, contact || '{"email":" Rivka@Example.com "}')->>'editToken';
  assert public.meal_get_my_signup(edit)->'signup'->>'email' = 'rivka@example.com';

  -- Managing admins: add, can't remove yourself, can remove others.
  perform public.meal_admin_add('  New@Example.com ');
  assert jsonb_array_length(public.meal_admin_list_admins()) = 3;
  begin
    perform public.meal_admin_add('nope');
    raise exception 'expected invalid';
  exception when raise_exception then assert sqlerrm = 'invalid', sqlerrm; end;
  begin
    perform public.meal_admin_remove('admin@example.com');
    raise exception 'expected forbidden';
  exception when raise_exception then assert sqlerrm = 'forbidden', sqlerrm; end;
  perform public.meal_admin_remove('new@example.com');
  perform public.meal_admin_remove('second@example.com');
  assert jsonb_array_length(public.meal_admin_list_admins()) = 1;

  -- Admin deletes the board.
  perform public.meal_admin_delete_board(slug);
  begin
    perform public.meal_get_manage(tok);
    raise exception 'expected not_found';
  exception when raise_exception then assert sqlerrm = 'not_found', sqlerrm; end;

  raise notice 'ALL ADMIN TESTS PASSED';
end $$;
