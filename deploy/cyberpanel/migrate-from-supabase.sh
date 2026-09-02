#!/bin/bash
# Copy Postgres data from Supabase (session pooler) into local Docker Postgres, then
# point mesa-api at localhost.
#
# Run on the CyberPanel server as root (or a user in the docker group).
#
# Required:
#   export SUPABASE_DATABASE_URL='postgresql://postgres.xxx:PASSWORD@aws-0-....pooler.supabase.com:5432/postgres?sslmode=require'
#   export REPO_DIR=/home/restaurant-pos.isarva.in/Restaurant-POS
#
# Optional:
#   LOCAL_DATABASE_URL — defaults to mesa-api/.env or secrets/postgres.env
#   SKIP_PM2_STOP=1
#   SKIP_REGISTRY_REWIRE=0

set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/restaurant-pos.isarva.in/Restaurant-POS}"
API_DIR="${REPO_DIR}/mesa-api"
SECRETS_DIR="${SECRETS_DIR:-/home/restaurant-pos.isarva.in/secrets}"
CREDS_FILE="${SECRETS_DIR}/postgres.env"
CONTAINER_NAME="${CONTAINER_NAME:-mesa-postgres}"
DUMP_DIR="${DUMP_DIR:-/tmp/mesa-supabase-migration}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

log() { echo "[migrate-supabase] $*"; }

PG_DOCKER_IMAGE="${PG_DOCKER_IMAGE:-postgres:17-alpine}"

pg_docker() {
  docker run --rm --network host \
    -e PGUSER -e PGPASSWORD -e PGHOST -e PGPORT -e PGDATABASE \
    -v "${DUMP_DIR}:/dumps" \
    "${PG_DOCKER_IMAGE}" "$@"
}

require_cmd() {
  for c in docker node; do
    if ! command -v "$c" >/dev/null 2>&1; then
      echo "ERROR: $c not found."
      exit 1
    fi
  done
}

load_local_url() {
  if [ -n "${LOCAL_DATABASE_URL:-}" ]; then
    return 0
  fi
  if [ -f "${CREDS_FILE}" ]; then
    # shellcheck disable=SC1090
    source "${CREDS_FILE}"
    LOCAL_DATABASE_URL="${DATABASE_URL:-}"
  fi
  if [ -z "${LOCAL_DATABASE_URL:-}" ] && [ -f "${API_DIR}/.env" ]; then
    local from_env
    from_env="$(grep -E '^DATABASE_URL=' "${API_DIR}/.env" | head -1 | cut -d= -f2- || true)"
    if [ -n "${from_env}" ] && [[ "${from_env}" != *supabase* ]]; then
      LOCAL_DATABASE_URL="${from_env}"
    fi
  fi
  if [ -z "${LOCAL_DATABASE_URL:-}" ]; then
    echo "ERROR: Set LOCAL_DATABASE_URL or run install-postgres.sh and update mesa-api/.env"
    exit 1
  fi
}

parse_url() {
  # Sets: PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE
  local url="$1"
  PGUSER="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.username))" "$url")"
  PGPASSWORD="$(node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.password))" "$url")"
  PGHOST="$(node -e "const u=new URL(process.argv[1]); console.log(u.hostname)" "$url")"
  PGPORT="$(node -e "const u=new URL(process.argv[1]); console.log(u.port||'5432')" "$url")"
  PGDATABASE="$(node -e "const u=new URL(process.argv[1]); console.log(u.pathname.replace(/^\\//,'')||'postgres')" "$url")"
  export PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE
}

dump_database() {
  local url="$1"
  local out="$2"
  parse_url "$url"
  local base
  base="$(basename "$out")"
  log "Dumping ${PGDATABASE} (public schema) from ${PGHOST}..."
  pg_docker pg_dump "$url" \
    --schema=public \
    --no-owner --no-acl --clean --if-exists \
    -F p -f "/dumps/${base}"
  sed -i \
    -e '/^SET transaction_timeout/d' \
    -e '/^CREATE EXTENSION.*supabase/d' \
    -e '/^COMMENT ON EXTENSION.*supabase/d' \
    -e '/^CREATE EXTENSION IF NOT EXISTS "pg_graphql"/d' \
    -e '/^CREATE EXTENSION IF NOT EXISTS "pg_net"/d' \
    -e '/^CREATE EXTENSION IF NOT EXISTS "pgjwt"/d' \
    -e '/^CREATE EXTENSION IF NOT EXISTS "pgsodium"/d' \
    -e '/^CREATE EXTENSION IF NOT EXISTS "vault"/d' \
    "$out" 2>/dev/null || sed -i '' \
    -e '/^SET transaction_timeout/d' \
    -e '/^CREATE EXTENSION.*supabase/d' \
    -e '/^COMMENT ON EXTENSION.*supabase/d' \
    "$out"
  test -s "$out"
}

restore_database() {
  local url="$1"
  local dump="$2"
  parse_url "$url"
  local base
  base="$(basename "$dump")"
  log "Restoring into local ${PGDATABASE}..."
  pg_docker psql "$url" -v ON_ERROR_STOP=1 -c "SELECT 1" >/dev/null
  pg_docker psql "$url" -v ON_ERROR_STOP=1 -f "/dumps/${base}"
}

list_tenant_databases() {
  parse_url "$SUPABASE_DATABASE_URL"
  pg_docker psql "$SUPABASE_DATABASE_URL" -At -c \
    "SELECT datname FROM pg_database WHERE datname LIKE 'mesa_t_%' ORDER BY datname"
}

create_local_database() {
  local db_name="$1"
  local admin_url
  admin_url="$(node -e "
    const u = new URL(process.argv[1]);
    u.pathname = '/postgres';
    console.log(u.toString());
  " "$LOCAL_DATABASE_URL")"
  parse_url "$admin_url"
  local exists
  exists="$(pg_docker psql "$admin_url" -At -c "SELECT 1 FROM pg_database WHERE datname='${db_name}'" || true)"
  if [ "${exists}" != "1" ]; then
    log "Creating local database ${db_name}..."
    pg_docker psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${db_name}\""
  fi
}

if [ -z "${SUPABASE_DATABASE_URL:-}" ]; then
  echo "ERROR: Set SUPABASE_DATABASE_URL (Supabase session pooler, port 5432)."
  exit 1
fi

require_cmd

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  echo "ERROR: Local Postgres container ${CONTAINER_NAME} not running. Run install-postgres.sh first."
  exit 1
fi

load_local_url

mkdir -p "${DUMP_DIR}"

PM2_WAS_RUNNING=0
if [ "${SKIP_PM2_STOP:-0}" != "1" ] && command -v pm2 >/dev/null 2>&1; then
  if pm2 describe mesa-api >/dev/null 2>&1; then
    PM2_WAS_RUNNING=1
    log "Stopping mesa-api during migration..."
    pm2 stop mesa-api || true
  fi
fi

cleanup() {
  if [ "${PM2_WAS_RUNNING}" = "1" ]; then
    log "Restarting mesa-api..."
    pm2 restart mesa-api --update-env || true
  fi
}
trap cleanup EXIT

# Primary Supabase database (usually "postgres")
PRIMARY_DUMP="${DUMP_DIR}/primary-${TIMESTAMP}.sql"
dump_database "$SUPABASE_DATABASE_URL" "$PRIMARY_DUMP"

LOCAL_PRIMARY_URL="$LOCAL_DATABASE_URL"
parse_url "$LOCAL_PRIMARY_URL"
restore_database "$LOCAL_PRIMARY_URL" "$PRIMARY_DUMP"

# Tenant databases (mesa_t_*)
log "Checking for tenant databases on Supabase..."
while IFS= read -r tenant_db; do
  [ -z "$tenant_db" ] && continue
  tenant_url="$(node -e "
    const base = new URL(process.argv[1]);
    base.pathname = '/' + process.argv[2];
    console.log(base.toString());
  " "$SUPABASE_DATABASE_URL" "$tenant_db")"
  tenant_dump="${DUMP_DIR}/${tenant_db}-${TIMESTAMP}.sql"
  dump_database "$tenant_url" "$tenant_dump"
  create_local_database "$tenant_db"
  local_tenant_url="$(node -e "
    const base = new URL(process.argv[1]);
    base.pathname = '/' + process.argv[2];
    console.log(base.toString());
  " "$LOCAL_DATABASE_URL" "$tenant_db")"
  restore_database "$local_tenant_url" "$tenant_dump"
done < <(list_tenant_databases || true)

if [ "${SKIP_REGISTRY_REWIRE:-0}" != "1" ]; then
  log "Rewiring TenantRegistry URLs to local DATABASE_URL..."
  (cd "${API_DIR}" && node scripts/rewire-tenant-registry.js)
fi

log "Running prisma migrate deploy (all tenants)..."
(cd "${API_DIR}" && npx prisma migrate deploy)
if [ -f "${API_DIR}/scripts/migrate-all-tenants.js" ]; then
  (cd "${API_DIR}" && node scripts/migrate-all-tenants.js)
else
  log "scripts/migrate-all-tenants.js not found — skipped"
fi

log "Updating mesa-api/.env DATABASE_URL if needed..."
if [ -f "${CREDS_FILE}" ] && [ -f "${API_DIR}/.env" ]; then
  # shellcheck disable=SC1090
  source "${CREDS_FILE}"
  if [ -n "${DATABASE_URL:-}" ]; then
    if grep -q '^DATABASE_URL=' "${API_DIR}/.env"; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" "${API_DIR}/.env"
    else
      echo "DATABASE_URL=${DATABASE_URL}" >>"${API_DIR}/.env"
    fi
    if [ -n "${DATABASE_ADMIN_URL:-}" ]; then
      if grep -q '^DATABASE_ADMIN_URL=' "${API_DIR}/.env"; then
        sed -i "s|^DATABASE_ADMIN_URL=.*|DATABASE_ADMIN_URL=${DATABASE_ADMIN_URL}|" "${API_DIR}/.env"
      else
        echo "DATABASE_ADMIN_URL=${DATABASE_ADMIN_URL}" >>"${API_DIR}/.env"
      fi
    fi
  fi
fi

log "Migration complete. Dumps kept in ${DUMP_DIR}"
log "Verify: curl -s http://127.0.0.1:3001/health"
log "When satisfied, cancel Supabase project billing / delete project."
