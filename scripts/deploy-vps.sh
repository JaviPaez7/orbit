#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Orbit — provision and deploy the API + web client on a Debian/Ubuntu VPS.
#
# Idempotent: safe to re-run for every deployment. Run as root (or via sudo):
#
#   sudo DOMAIN=orbit.example.com DB_PASSWORD='***' AUTH_SECRET='***' \
#        SEED=true bash scripts/deploy-vps.sh
#
# Environment:
#   DOMAIN        required  public hostname (used for nginx + APP_URL)
#   DB_PASSWORD   required  password for the `orbit` PostgreSQL role
#   AUTH_SECRET   required  32+ random bytes; generated on first run if omitted
#   REPO_URL      optional  defaults to the GitHub origin
#   BRANCH        optional  defaults to `master`
#   APP_DIR       optional  defaults to /opt/orbit
#   SEED          optional  `true` seeds the demo data on first deploy
#   SKIP_TLS      optional  `true` skips certbot (no DNS yet / testing)
# ---------------------------------------------------------------------------
set -Eeuo pipefail

DOMAIN="${DOMAIN:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
AUTH_SECRET="${AUTH_SECRET:-}"
REPO_URL="${REPO_URL:-https://github.com/JaviPaez7/orbit.git}"
BRANCH="${BRANCH:-master}"
APP_DIR="${APP_DIR:-/opt/orbit}"
SERVICE_USER="${SERVICE_USER:-orbit}"
SEED="${SEED:-false}"
SKIP_TLS="${SKIP_TLS:-false}"
PG_DB="${PG_DB:-orbit}"
PG_USER="${PG_USER:-orbit}"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
[[ -n "$DOMAIN" ]] || die "DOMAIN is required, e.g. DOMAIN=orbit.example.com"
[[ -n "$DB_PASSWORD" ]] || die "DB_PASSWORD is required (password for the PostgreSQL role)."

if [[ -z "$AUTH_SECRET" ]]; then
  AUTH_SECRET="$(openssl rand -hex 48)"
  warn "AUTH_SECRET was not provided; generated a new one. Existing sessions will be invalidated."
fi

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------------------
# 1. System packages (Node 22, PostgreSQL, nginx, git, build tools, certbot)
# ---------------------------------------------------------------------------
log "Installing system packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git build-essential nginx postgresql postgresql-contrib

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  log "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
log "Node $(node -v), npm $(npm -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  log "Installing pnpm"
  corepack enable
  corepack prepare pnpm@10 --activate
fi
log "pnpm $(pnpm -v)"

if ! command -v certbot >/dev/null 2>&1 && [[ "$SKIP_TLS" != "true" ]]; then
  apt-get install -y -qq certbot python3-certbot-nginx
fi

# ---------------------------------------------------------------------------
# 2. PostgreSQL: role + database
# ---------------------------------------------------------------------------
log "Configuring PostgreSQL"
systemctl enable --now postgresql >/dev/null

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
# Always (re)set the password so a re-run with a new secret converges.
sudo -u postgres psql -c "ALTER ROLE ${PG_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};" >/dev/null
sudo -u postgres psql -c "ALTER DATABASE ${PG_DB} OWNER TO ${PG_USER};" >/dev/null

# The app only needs the public schema.
sudo -u postgres psql -d "${PG_DB}" -c "GRANT ALL ON SCHEMA public TO ${PG_USER};" >/dev/null
log "PostgreSQL ready: ${PG_USER}@${PG_DB}"

# ---------------------------------------------------------------------------
# 3. Service user + application checkout
# ---------------------------------------------------------------------------
log "Preparing ${APP_DIR}"
id -u "${SERVICE_USER}" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"

if [[ -d "${APP_DIR}/.git" ]]; then
  log "Updating existing checkout"
  git -C "${APP_DIR}" fetch --all --prune
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" reset --hard "origin/${BRANCH}"
else
  log "Cloning ${REPO_URL}"
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

# ---------------------------------------------------------------------------
# 4. Switch Prisma to PostgreSQL, install, migrate, seed
# ---------------------------------------------------------------------------
log "Selecting the PostgreSQL Prisma schema"
cp "${APP_DIR}/apps/server/prisma/schema.postgres.prisma" "${APP_DIR}/apps/server/prisma/schema.prisma"
rm -rf "${APP_DIR}/apps/server/prisma/migrations"
cp -r "${APP_DIR}/apps/server/prisma/migrations.pg" "${APP_DIR}/apps/server/prisma/migrations"

log "Installing dependencies"
cd "${APP_DIR}"
pnpm install --frozen-lockfile

log "Writing ${APP_DIR}/apps/server/.env"
cat > "${APP_DIR}/apps/server/.env" <<EOF
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
APP_URL=https://${DOMAIN}
DATABASE_URL="postgresql://${PG_USER}:${DB_PASSWORD}@127.0.0.1:5432/${PG_DB}?schema=public"
AUTH_SECRET="${AUTH_SECRET}"
SESSION_TTL_DAYS=30
RESET_TOKEN_TTL_MINUTES=60
CORS_ORIGINS="https://${DOMAIN}"
UPLOAD_DIR=uploads
EXPOSE_RESET_TOKEN=false
COOKIE_SECURE=true
LOG_LEVEL=info
EOF
chmod 600 "${APP_DIR}/apps/server/.env"
mkdir -p "${APP_DIR}/apps/server/uploads"

log "Generating Prisma Client (PostgreSQL)"
pnpm --filter @orbit/server exec prisma generate

log "Applying database migrations"
pnpm --filter @orbit/server exec prisma migrate deploy

if [[ "$SEED" == "true" ]]; then
  log "Seeding demo data"
  pnpm --filter @orbit/server db:seed
else
  log "Skipping seed (set SEED=true to load the demo workspace)"
fi

# ---------------------------------------------------------------------------
# 5. Build (shared → server → web)
# ---------------------------------------------------------------------------
log "Building the workspace"
pnpm build

# Same-origin deployment: the client calls /api on its own host, so no CORS and
# a first-party session cookie. Empty VITE_API_URL selects relative URLs.
log "Building the web client for same-origin deployment"
rm -rf "${APP_DIR}/apps/web/dist"
VITE_API_URL="" VITE_WS_URL="" pnpm --filter @orbit/web build

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"

# ---------------------------------------------------------------------------
# 6. systemd service
# ---------------------------------------------------------------------------
log "Installing the systemd unit"
install -m 644 "${APP_DIR}/deploy/orbit-api.service" /etc/systemd/system/orbit-api.service
systemctl daemon-reload
systemctl enable orbit-api >/dev/null
systemctl restart orbit-api
sleep 2
systemctl is-active --quiet orbit-api || {
  journalctl -u orbit-api -n 40 --no-pager || true
  die "orbit-api failed to start (see the journal above)"
}
log "orbit-api is running"

# ---------------------------------------------------------------------------
# 7. nginx
# ---------------------------------------------------------------------------
log "Configuring nginx for ${DOMAIN}"
# Two substitutions: the upstream keeps 127.0.0.1:4000, only server_name changes.
sed "s/orbit\.example\.com/${DOMAIN}/g" "${APP_DIR}/deploy/nginx-orbit.conf" \
  > /etc/nginx/sites-available/orbit
ln -sf /etc/nginx/sites-available/orbit /etc/nginx/sites-enabled/orbit
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
log "nginx reloaded"

# ---------------------------------------------------------------------------
# 8. TLS
# ---------------------------------------------------------------------------
if [[ "$SKIP_TLS" != "true" ]]; then
  log "Requesting a Let's Encrypt certificate for ${DOMAIN}"
  if certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email \
      --redirect -d "${DOMAIN}"; then
    log "TLS enabled"
  else
    warn "certbot failed — check that ${DOMAIN} resolves to this server, then re-run:"
    warn "  certbot --nginx -d ${DOMAIN}"
  fi
fi

# ---------------------------------------------------------------------------
# 9. Verify
# ---------------------------------------------------------------------------
log "Verifying the deployment"
sleep 1
if curl -fsS http://127.0.0.1:4000/health >/dev/null; then
  log "API health check OK"
else
  warn "API health check failed on 127.0.0.1:4000"
fi
if curl -fsS "https://${DOMAIN}/health" >/dev/null 2>&1; then
  log "Public health check OK (https://${DOMAIN}/health)"
elif curl -fsS "http://${DOMAIN}/health" >/dev/null 2>&1; then
  log "Public health check OK (http://${DOMAIN}/health)"
else
  warn "Public health check failed — DNS may not point here yet."
fi

cat <<EOF

────────────────────────────────────────────────────────────────
 Orbit deployed
────────────────────────────────────────────────────────────────
  App          https://${DOMAIN}
  API health   https://${DOMAIN}/health
  App dir      ${APP_DIR}
  Service      systemctl status orbit-api
  Logs         journalctl -u orbit-api -f
  DB           psql "postgresql://${PG_USER}@127.0.0.1:5432/${PG_DB}"

  Demo login   javi@orbit.dev / Orbit1234   (only if SEED=true)

  Redeploy     sudo DOMAIN=${DOMAIN} DB_PASSWORD='<pw>' AUTH_SECRET='<same-secret>' bash ${APP_DIR}/scripts/deploy-vps.sh
────────────────────────────────────────────────────────────────
EOF
