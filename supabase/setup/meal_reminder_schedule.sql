-- Project-specific setup (not a portable migration): runs the evening-before
-- reminders every day. Applied to project vipbambqmpjftdzouwsi as the migration
-- "meal_reminder_schedule". Needs Supabase's pg_cron, pg_net and Vault.
--
-- A random shared secret is generated inside Vault, so it never appears in code,
-- logs or chat. pg_cron sends it to the meal-send-reminders function, which checks
-- it with meal_check_cron_secret (callable only with the service role key).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'meal_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'meal_cron_secret',
      'Shared secret: pg_cron -> meal-send-reminders edge function');
  end if;
end $$;

create or replace function public.meal_check_cron_secret(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'meal_cron_secret' and decrypted_secret = p_secret);
$$;
revoke execute on function public.meal_check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.meal_check_cron_secret(text) to service_role;

-- 16:07 UTC = 18:07 Israel winter time, 19:07 summer time.
select cron.unschedule('meal-send-reminders') where exists (select 1 from cron.job where jobname = 'meal-send-reminders');
select cron.schedule('meal-send-reminders', '7 16 * * *', $job$
  select net.http_post(
    url := 'https://vipbambqmpjftdzouwsi.supabase.co/functions/v1/meal-send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'meal_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
$job$);
