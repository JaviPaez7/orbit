#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Orbit API container entrypoint.
#
# Runs on every boot and is safe to repeat:
#   1. select the PostgreSQL Prisma schema and generate the client
#   2. apply migrations (idempotent)
#   3. seed the demo workspace exactly once, when SEED_DEMO_DATA=true
#   4. exec the API so it becomes PID 1 and receives SIGTERM directly
# ---------------------------------------------------------------------------
set -Eeuo pipefail

log() { printf '\033[1;36m[orbit]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[orbit] %s\033[0m\n' "$*" >&2; exit 1; }

cd /app
SERVER_DIR=/app/apps/server

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is not set"
[[ -n "${AUTH_SECRET:-}" ]] || die "AUTH_SECRET is not set"

log "Selecting the PostgreSQL Prisma schema"
cp "${SERVER_DIR}/prisma/schema.postgres.prisma" "${SERVER_DIR}/prisma/schema.prisma"
rm -rf "${SERVER_DIR}/prisma/migrations"
cp -r "${SERVER_DIR}/prisma/migrations.pg" "${SERVER_DIR}/prisma/migrations"

# Binaries are called directly (no `pnpm exec`): pnpm would verify the
# workspace and reinstall it from the registry on every boot.
PRISMA="${SERVER_DIR}/node_modules/.bin/prisma"
TSX="${SERVER_DIR}/node_modules/.bin/tsx"

log "Generating the Prisma Client"
(cd "$SERVER_DIR" && "$PRISMA" generate)

log "Applying database migrations"
(cd "$SERVER_DIR" && "$PRISMA" migrate deploy)

# Seeding wipes and rebuilds the demo dataset, so it must never run again after
# real work exists. It is guarded by an explicit flag *and* a first-run marker
# inside the database (the marker survives restarts, unlike the container).
if [[ "${SEED_DEMO_DATA:-false}" == "true" ]]; then
  # Resolved from the server package: from /app `@prisma/client` is not
  # reachable, the check fails silently and the seed wipes the data every boot.
  already_seeded="$(cd "$SERVER_DIR" && node -e '
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    prisma.user.count()
      .then((n) => { console.log(n > 0 ? "yes" : "no"); })
      .catch(() => { console.log("no"); })
      .finally(() => prisma.$disconnect());
  ' 2>/dev/null || echo "no")"

  if [[ "$already_seeded" == "yes" ]]; then
    log "Demo data already present — skipping the seed"
  else
    log "Seeding the demo workspace (first boot)"
    (cd "$SERVER_DIR" && "$TSX" prisma/seed.ts)
  fi
fi

log "Starting the API on ${HOST}:${PORT}"
exec "$@"
