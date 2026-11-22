#!/usr/bin/env bash
# Applies the migration to a fresh database and runs the SQL tests.
# Usage: scripts/test-db.sh [psql connection args...]   e.g. -h localhost -p 5432 -U postgres
set -euo pipefail
cd "$(dirname "$0")/.."
DB="nmc_test_$$"
psql "$@" -v ON_ERROR_STOP=1 -q -d postgres -c "create database $DB"
trap 'psql "$@" -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql "$@" -v ON_ERROR_STOP=1 -q -d "$DB" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
SQL
# Minimal stand-in for Supabase Auth: auth.users and auth.uid() read from the JWT claims setting.
psql "$@" -v ON_ERROR_STOP=1 -q -d "$DB" <<'SQL'
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
grant usage on schema auth to anon, authenticated;
SQL
for f in supabase/migrations/*.sql; do
  psql "$@" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
# Test-only helper (the database is dropped afterwards): approve a board as if an admin did.
psql "$@" -v ON_ERROR_STOP=1 -q -d "$DB" -c "create function public.test_approve(p_slug text) returns void language sql security definer as \$\$ update public.meal_boards set status = 'approved' where slug = p_slug \$\$; grant execute on function public.test_approve(text) to anon, authenticated;"
for f in tests/sql/*.test.sql; do
  psql "$@" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
