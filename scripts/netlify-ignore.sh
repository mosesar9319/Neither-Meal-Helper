#!/usr/bin/env bash
# Netlify runs this before every build (see netlify.toml). Exit 0 = skip the build,
# anything else = build. Skips pushes that change nothing the site is built from
# (docs, tests, database or email-function files), so they don't use deploy credits.
set -u
site_paths=(src public index.html package.json package-lock.json netlify.toml vite.config.ts tsconfig.json)

# No previous build to compare with, or the same commit again (someone clicked
# "Trigger deploy"): always build.
if [ -z "${CACHED_COMMIT_REF:-}" ] || [ -z "${COMMIT_REF:-}" ] || [ "$CACHED_COMMIT_REF" = "$COMMIT_REF" ]; then
  exit 1
fi

# git diff --quiet: 0 = no site changes (skip), 1 = changes (build), >1 = error (build).
git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- "${site_paths[@]}"
