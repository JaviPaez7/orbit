#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Orbit — dedicated TLS certificate via acme.sh (Cloudflare DNS-01).
#
# Why this exists instead of Traefik's own resolver: this host runs one shared
# Traefik instance holding 30+ certificates for other sites, and its own
# Cloudflare DNS-01 attempt for this domain kept failing validation. Issuing a
# certificate out-of-band and loading it through Traefik's *file* provider keeps
# the shared ACME store completely untouched and makes renewal independent.
#
# Idempotent: re-running renews only when the certificate is close to expiry.
# Run on the VPS as root:
#
#   CF_DNS_API_TOKEN=... bash scripts/tls-orbit.sh
# ---------------------------------------------------------------------------
set -Eeuo pipefail

DOMAIN="${DOMAIN:-orbit.javistudio.dev}"
CERT_DIR="${CERT_DIR:-/opt/traefik/certs}"
ACME_HOME="${ACME_HOME:-/root/.acme.sh}"
TOKEN="${CF_DNS_API_TOKEN:-}"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root."
[[ -n "$TOKEN" ]] || die "CF_DNS_API_TOKEN is required"

export CF_Token="$TOKEN"
export CF_Key=""
export CF_Email=""

# ---------------------------------------------------------------------------
# 1. acme.sh
# ---------------------------------------------------------------------------
if [[ ! -x "${ACME_HOME}/acme.sh" ]]; then
  log "Installing acme.sh"
  apt-get update -qq
  apt-get install -y -qq curl socat cron openssl
  # Fetch the installer and execute it directly: piping into `sh -s --` makes
  # acme.sh see a duplicated `--` and reject `--home`.
  installer="$(mktemp)"
  curl -fsS https://raw.githubusercontent.com/acmesh-official/acme.sh/master/acme.sh -o "${installer}"
  bash "${installer}" --install --home "${ACME_HOME}" --accountemail "admin@javistudio.dev" >/dev/null
  rm -f "${installer}"
fi
[[ -x "${ACME_HOME}/acme.sh" ]] || die "acme.sh is not usable at ${ACME_HOME}"
"${ACME_HOME}/acme.sh" --version >/dev/null

# Let's Encrypt is the default CA; state it explicitly so a future default
# change cannot silently switch to a CA with a different trust chain.
"${ACME_HOME}/acme.sh" --set-default-ca --server letsencrypt >/dev/null

# ---------------------------------------------------------------------------
# 2. Issue (or renew) the certificate
# ---------------------------------------------------------------------------
log "Requesting a certificate for ${DOMAIN} (Cloudflare DNS-01)"
"${ACME_HOME}/acme.sh" --issue --dns dns_cf -d "${DOMAIN}" --keylength ec-256 --log

install -d -m 755 "${CERT_DIR}"

log "Installing the certificate to ${CERT_DIR}"
"${ACME_HOME}/acme.sh" --install-cert -d "${DOMAIN}" --ecc \
  --key-file       "${CERT_DIR}/${DOMAIN}.key" \
  --fullchain-file "${CERT_DIR}/${DOMAIN}.crt" \
  --reloadcmd      "echo 'certificate installed; Traefik file provider picks it up automatically'"

chmod 644 "${CERT_DIR}/${DOMAIN}.crt"
chmod 600 "${CERT_DIR}/${DOMAIN}.key"

# ---------------------------------------------------------------------------
# 3. Verify what was installed
# ---------------------------------------------------------------------------
log "Installed certificate"
openssl x509 -in "${CERT_DIR}/${DOMAIN}.crt" -noout -subject -issuer -enddate

# ---------------------------------------------------------------------------
# 4. Renewal
# ---------------------------------------------------------------------------
# acme.sh installs its own cron entry; make sure it exists and renews quietly.
if ! crontab -l 2>/dev/null | grep -q "acme.sh"; then
  log "Registering the renewal cron entry"
  (crontab -l 2>/dev/null; echo "17 3 * * * \"${ACME_HOME}/acme.sh\" --cron --home \"${ACME_HOME}\" > /dev/null") | crontab -
fi
crontab -l 2>/dev/null | grep -c "acme.sh" | xargs -I{} echo "cron entries for acme.sh: {}"

cat <<EOF

────────────────────────────────────────────────────────────────
 Certificate ready
────────────────────────────────────────────────────────────────
  Domain       ${DOMAIN}
  Full chain   ${CERT_DIR}/${DOMAIN}.crt
  Private key  ${CERT_DIR}/${DOMAIN}.key
  Renewal      acme.sh cron (daily, renews ~30 days before expiry)

  Traefik must load it from its dynamic configuration; see
  /opt/traefik/traefik-dynamic.yml (tls.certificates).
────────────────────────────────────────────────────────────────
EOF
