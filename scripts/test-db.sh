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
end $$;
SQL
for f in supabase/migrations/*.sql; do
  psql "$@" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
psql "$@" -v ON_ERROR_STOP=1 -q -d "$DB" -f tests/sql/rpc.test.sql
