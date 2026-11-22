-- Exact organizer lookup for the meal-recover-links function (ported from PR #1).
-- The function used an ILIKE filter, where "%" and "_" act as wildcards; this
-- compares the whole address, case-insensitively. Service role only.

create function public.meal_organizer_board_ids(p_email text)
returns table (board_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.board_id
  from public.meal_board_private p
  where p.organizer_email <> ''
    and char_length(btrim(coalesce(p_email, ''))) between 3 and 200
    and lower(p.organizer_email) = lower(btrim(p_email))
  limit 30;
$$;

revoke all on function public.meal_organizer_board_ids(text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.meal_organizer_board_ids(text) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.meal_organizer_board_ids(text) to service_role';
  end if;
end $$;
