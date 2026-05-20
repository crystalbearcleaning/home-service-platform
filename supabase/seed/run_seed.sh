#!/usr/bin/env bash
# =========================================================================
# Seed runner — applies all phase seeds in order.
#
# Loads from .env.local:
#   - SEED_ADMIN_EMAIL              → substituted into phase_1_seed.sql
#   - SEED_NOTIFICATION_PHONE_E164  → substituted into phase_3_seed.sql
#
# Both placeholders are substituted into per-phase temp files before being
# piped to `supabase db query --linked`. Each seed file is idempotent and
# safe to re-run.
#
# Prerequisites:
#   - Supabase CLI on PATH (e.g. via Homebrew at /opt/homebrew/bin)
#   - Project already linked (supabase link --project-ref <ref> succeeded)
#   - .env.local exists (env vars optional — empty values are tolerated)
# =========================================================================
set -euo pipefail

# Resolve repo paths from this script's location.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PHASE_1_SQL="${SCRIPT_DIR}/phase_1_seed.sql"
PHASE_3_SQL="${SCRIPT_DIR}/phase_3_seed.sql"
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

for f in "$PHASE_1_SQL" "$PHASE_3_SQL"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: seed SQL not found at $f" >&2
    exit 1
  fi
done

# Read a key=value pair from .env.local without exporting other variables.
read_env_var() {
  local key="$1"
  local raw=""
  if [ -f "$ENV_FILE" ]; then
    raw="$(grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
    raw="${raw#\"}"; raw="${raw%\"}"
    raw="${raw#\'}"; raw="${raw%\'}"
    raw="$(printf '%s' "$raw" | tr -d '\r' | sed 's/[[:space:]]*$//')"
  fi
  printf '%s' "$raw"
}

if [ ! -f "$ENV_FILE" ]; then
  echo "WARNING: $ENV_FILE not found. Seeds will run with empty placeholders." >&2
fi

SEED_ADMIN_EMAIL="$(read_env_var SEED_ADMIN_EMAIL)"
SEED_NOTIFICATION_PHONE_E164="$(read_env_var SEED_NOTIFICATION_PHONE_E164)"

if [ -z "$SEED_ADMIN_EMAIL" ]; then
  echo "WARNING: SEED_ADMIN_EMAIL is empty. Phase 1 seed will skip admin user linking." >&2
fi
if [ -z "$SEED_NOTIFICATION_PHONE_E164" ]; then
  echo "WARNING: SEED_NOTIFICATION_PHONE_E164 is empty. Phase 3 seed will skip notification recipient." >&2
fi

# SQL-escape any single quotes in env values before substituting.
ESCAPED_EMAIL="${SEED_ADMIN_EMAIL//\'/\'\'}"
ESCAPED_PHONE="${SEED_NOTIFICATION_PHONE_E164//\'/\'\'}"

apply_seed() {
  local label="$1"
  local sql_path="$2"
  local placeholder="$3"
  local value="$4"

  local tmp_sql
  tmp_sql="$(mktemp -t "$(basename "$sql_path" .sql).XXXXXX.sql")"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp_sql'" RETURN

  sed "s|${placeholder}|${value}|g" "$sql_path" > "$tmp_sql"

  if grep -q "$placeholder" "$tmp_sql"; then
    echo "ERROR: ${placeholder} placeholder substitution failed for ${sql_path}." >&2
    return 1
  fi

  echo "Applying ${label}..."
  echo "  Seed file: ${sql_path}"
  supabase db query --linked --file "$tmp_sql" --output table
  echo
}

echo "Applying seeds to the linked Supabase project..."
echo "  SEED_ADMIN_EMAIL:              ${SEED_ADMIN_EMAIL:-<empty — admin link will be skipped>}"
if [ -z "$SEED_NOTIFICATION_PHONE_E164" ]; then
  echo "  SEED_NOTIFICATION_PHONE_E164:  <empty — recipient will be skipped>"
else
  echo "  SEED_NOTIFICATION_PHONE_E164:  <set>"
fi
echo

apply_seed "Phase 1 seed" "$PHASE_1_SQL" "__SEED_ADMIN_EMAIL__" "$ESCAPED_EMAIL"
apply_seed "Phase 3 seed" "$PHASE_3_SQL" "__SEED_NOTIFICATION_PHONE_E164__" "$ESCAPED_PHONE"

echo "All seeds complete. Review the NOTICE lines above for skipped optional steps."
