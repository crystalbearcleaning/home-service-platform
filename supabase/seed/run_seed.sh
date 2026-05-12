#!/usr/bin/env bash
# =========================================================================
# Phase 1 seed runner
# - Loads SEED_ADMIN_EMAIL from .env.local
# - Substitutes it into phase_1_seed.sql (the only placeholder)
# - Applies the substituted SQL via `supabase db query --linked`
#
# Prerequisites:
#   - Supabase CLI on PATH (e.g. via Homebrew at /opt/homebrew/bin)
#   - Project already linked (supabase link --project-ref <ref> succeeded)
#   - .env.local contains SEED_ADMIN_EMAIL=...
#
# Idempotent: safe to re-run.
# =========================================================================
set -euo pipefail

# Resolve repo paths from this script's location.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SEED_SQL="${SCRIPT_DIR}/phase_1_seed.sql"
ENV_FILE="${PROJECT_ROOT}/.env.local"

# Make sure Homebrew bin is on PATH (no-op if already there).
case ":$PATH:" in
  *":/opt/homebrew/bin:"*) ;;
  *) export PATH="/opt/homebrew/bin:$PATH" ;;
esac

if ! command -v supabase >/dev/null 2>&1; then
  echo "ERROR: 'supabase' CLI not found on PATH." >&2
  echo "       Install via: brew install supabase/tap/supabase" >&2
  exit 1
fi

if [ ! -f "$SEED_SQL" ]; then
  echo "ERROR: seed SQL not found at $SEED_SQL" >&2
  exit 1
fi

# Read SEED_ADMIN_EMAIL from .env.local without exporting any other variables.
SEED_ADMIN_EMAIL=""
if [ -f "$ENV_FILE" ]; then
  RAW="$(grep -E '^SEED_ADMIN_EMAIL=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
  # Strip surrounding quotes and whitespace
  RAW="${RAW#\"}"; RAW="${RAW%\"}"
  RAW="${RAW#\'}"; RAW="${RAW%\'}"
  SEED_ADMIN_EMAIL="$(printf '%s' "$RAW" | tr -d '\r' | sed 's/[[:space:]]*$//')"
else
  echo "WARNING: $ENV_FILE not found. Seed will run without admin linking." >&2
fi

if [ -z "$SEED_ADMIN_EMAIL" ]; then
  echo "WARNING: SEED_ADMIN_EMAIL is empty. Seed will run, but no admin user will be linked." >&2
fi

# SQL-escape any single quotes in the email value before substituting.
ESCAPED_EMAIL="${SEED_ADMIN_EMAIL//\'/\'\'}"

# Substitute placeholder into a temp file (cleaned up on exit).
TMP_SQL="$(mktemp -t phase_1_seed.XXXXXX.sql)"
trap 'rm -f "$TMP_SQL"' EXIT

sed "s|__SEED_ADMIN_EMAIL__|${ESCAPED_EMAIL}|g" "$SEED_SQL" > "$TMP_SQL"

# Defensive: confirm the placeholder was fully substituted.
if grep -q '__SEED_ADMIN_EMAIL__' "$TMP_SQL"; then
  echo "ERROR: SEED_ADMIN_EMAIL placeholder substitution failed." >&2
  exit 1
fi

echo "Applying Phase 1 seed to the linked Supabase project..."
echo "  Seed file:        $SEED_SQL"
echo "  SEED_ADMIN_EMAIL: ${SEED_ADMIN_EMAIL:-<empty — admin link will be skipped>}"
echo

# Run the seed. --linked routes through Supabase Management API.
# --output table is human-readable; the RAISE NOTICE lines go to stderr.
supabase db query --linked --file "$TMP_SQL" --output table

echo
echo "Phase 1 seed run finished. Check the NOTICE lines above for the admin-link result."
