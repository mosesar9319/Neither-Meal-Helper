-- Admins: every meal someone signed up to cook, across all approved boards, in date order.
-- Each item is the sign-up (with phone and email) plus its board. Admins only.
create function public.meal_admin_list_meals(p_include_past boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform meal_private.require_admin();
  return coalesce((
    select jsonb_agg(
      meal_private.signup_json(s) || jsonb_build_object('board', meal_private.board_json(b))
      order by s.meal_date, array_position(array['breakfast','lunch','dinner'], s.slot), s.created_at)
    from public.meal_signups s
    join public.meal_boards b on b.id = s.board_id
    where b.status = 'approved'
      and (coalesce(p_include_past, false) or s.meal_date >= current_date)), '[]'::jsonb);
end $$;

revoke execute on function public.meal_admin_list_meals(boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.meal_admin_list_meals(boolean) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.meal_admin_list_meals(boolean) to authenticated;
  end if;
end $$;
