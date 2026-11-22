-- Admins can take a board offline (status 'offline'): hidden from the public and closed
-- to sign-ups, with everything kept so it can be put back online.

do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.meal_boards'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.meal_boards drop constraint %I', c);
  end loop;
end $$;
alter table public.meal_boards add constraint meal_boards_status_check
  check (status in ('pending','approved','declined','offline'));

create or replace function public.meal_admin_list_requests(p_status text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform meal_private.require_admin();
  perform meal_private.check(p_status in ('pending','approved','declined','offline'), 'invalid');
  return coalesce((
    select jsonb_agg(
      meal_private.board_json(b) || jsonb_build_object(
        'createdAt', b.created_at,
        'reviewedAt', b.reviewed_at,
        'reviewedBy', b.reviewed_by,
        'private', meal_private.private_json(pr, true),
        'manageToken', (select m.token from public.meal_managers m where m.board_id = b.id and m.role = 'owner' limit 1),
        'signupCount', (select count(*) from public.meal_signups s where s.board_id = b.id))
      order by b.created_at desc)
    from public.meal_boards b
    join public.meal_board_private pr on pr.board_id = b.id
    where b.status = p_status), '[]'::jsonb);
end $$;

create or replace function public.meal_admin_review(p_slug text, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare e text;
begin
  e := meal_private.require_admin();
  perform meal_private.check(p_status in ('pending','approved','declined','offline'), 'invalid');
  perform meal_private.check(char_length(coalesce(p_note, '')) <= 500, 'invalid');
  update public.meal_boards set
    status = p_status,
    review_note = btrim(coalesce(p_note, '')),
    reviewed_at = now(),
    reviewed_by = e
  where slug = p_slug;
  perform meal_private.check(found, 'not_found');
end $$;

