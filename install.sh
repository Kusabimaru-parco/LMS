#!/usr/bin/env bash
# Campus LMS installer for Linux servers (Docker). Ubuntu 22.04+/Debian 12+ recommended; any
# distribution with Docker works.
#
# Interactive:      sudo ./install.sh
# Non-interactive:  sudo ./install.sh --domain lms.school.edu --email it@school.edu --yes
#                   sudo ./install.sh --port 3000 --yes            (no domain, plain http on a LAN)
# Options:
#   --domain NAME        public domain name (enables automatic HTTPS with Let's Encrypt)
#   --email ADDRESS      contact email for Let's Encrypt (recommended with --domain)
#   --port N             port to use when there is no domain (default 3000)
#   --image NAME         use prebuilt images (e.g. ghcr.io/your-company/campus-lms) instead of building
#   --update-feed URL    where to check for new versions (optional)
#   --no-backups         don't schedule the nightly backup
#   --yes                accept defaults, install Docker if missing, don't ask questions
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33mWarning:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }
ask() { # ask "Question" default -> REPLY
  if [ "$YES" = 1 ]; then REPLY="$2"; return; fi
  read -r -p "$1 [${2}]: " REPLY || true
  REPLY="${REPLY:-$2}"
}

DOMAIN="" EMAIL="" APP_PORT="" IMAGE="" FEED="" YES=0 BACKUPS=1
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --port) APP_PORT="${2:-}"; shift 2 ;;
    --image) IMAGE="${2:-}"; shift 2 ;;
    --update-feed) FEED="${2:-}"; shift 2 ;;
    --no-backups) BACKUPS=0; shift ;;
    --yes|-y) YES=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) fail "Unknown option: $1 (see --help)" ;;
  esac
done

VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' package.json | head -1)"
bold "Campus LMS ${VERSION} installer"
echo

# ---------------------------------------------------------------- 1. Pre-flight checks
[ "$(uname -s)" = "Linux" ] || fail "This installer is for Linux. On Windows use install-windows.cmd."
[ -f .env ] && fail "Campus LMS is already installed here (.env exists). To upgrade, run: ./lms.sh update"
IS_ROOT=0; [ "$(id -u)" = 0 ] && IS_ROOT=1

mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
disk_mb=$(df -Pm . | awk 'NR==2 {print $4}')
info "Memory: ${mem_mb} MB · free disk: ${disk_mb} MB"
if [ -z "$IMAGE" ] && [ "$mem_mb" -lt 1800 ]; then
  warn "Building needs about 2 GB of RAM. Add memory or swap, or install with --image to use a prebuilt image."
  [ "$YES" = 1 ] || { ask "Continue anyway? (y/n)" "n"; [ "$REPLY" = y ] || exit 1; }
fi
[ "$disk_mb" -lt 6000 ] && warn "Less than 6 GB of free disk space. Uploads and backups need room to grow."

if ! command -v docker >/dev/null 2>&1; then
  warn "Docker is not installed."
  [ "$IS_ROOT" = 1 ] || fail "Run this installer with sudo so it can install Docker, or install Docker first: https://docs.docker.com/engine/install/"
  ask "Install Docker now from get.docker.com? (y/n)" "y"
  [ "$REPLY" = y ] || fail "Docker is required."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker >/dev/null 2>&1 || true
fi
docker compose version >/dev/null 2>&1 || fail "The Docker Compose plugin is missing. Install 'docker-compose-plugin' and run this again."
docker info >/dev/null 2>&1 || fail "Docker is installed but not running, or this user can't use it. Try: sudo ./install.sh"

# ---------------------------------------------------------------- 2. Questions
if [ -z "$DOMAIN" ] && [ -z "$APP_PORT" ]; then
  echo "Do you have a domain name pointing to this server (for example lms.yourschool.edu)?"
  echo "With a domain, HTTPS is set up automatically. Leave it empty for http://<server-ip>:3000 on your network."
  ask "Domain (optional)" ""
  DOMAIN="$REPLY"
fi
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
if [ -n "$DOMAIN" ]; then
  [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail "\"$DOMAIN\" doesn't look like a domain name."
  [ -n "$EMAIL" ] || { ask "Email for HTTPS certificate notices" "admin@${DOMAIN#*.}"; EMAIL="$REPLY"; }
  resolved="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}')"
  if [ -z "$resolved" ]; then
    warn "$DOMAIN doesn't resolve yet. Point its DNS A record at this server, or HTTPS can't be issued."
  else
    info "$DOMAIN points to $resolved (this server: $(hostname -I 2>/dev/null | awk '{print $1}'))"
  fi
  NEED_PORTS="80 443"; APP_PORT=3000; APP_BIND=127.0.0.1; PROFILES=https; APP_URL="https://$DOMAIN"
else
  [ -n "$APP_PORT" ] || { ask "Port" "3000"; APP_PORT="$REPLY"; }
  [[ "$APP_PORT" =~ ^[0-9]+$ ]] && [ "$APP_PORT" -ge 1 ] && [ "$APP_PORT" -le 65535 ] || fail "Port must be a number from 1 to 65535."
  NEED_PORTS="$APP_PORT"; APP_BIND=0.0.0.0; PROFILES=""; APP_URL=""
fi

for p in $NEED_PORTS; do
  if command -v ss >/dev/null 2>&1 && ss -ltnH "sport = :$p" 2>/dev/null | grep -q .; then
    fail "Port $p is already in use by another program. Stop it or choose another port."
  fi
done

# ---------------------------------------------------------------- 3. Secrets and settings
rand() ( set +o pipefail; head -c 256 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c "$1" )
code_part() ( set +o pipefail; head -c 512 /dev/urandom | tr -dc 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' | head -c 4 )
SETUP_CODE="$(code_part)-$(code_part)-$(code_part)"

umask 077
cat > .env <<EOF
# Created by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Keep this file private and back it up:
# without AUTH_SECRET, stored integration passwords can't be decrypted.
COMPOSE_PROJECT_NAME=campus-lms
LMS_VERSION=$VERSION
LMS_IMAGE=${IMAGE:-campus-lms}
POSTGRES_PASSWORD=$(rand 32)
AUTH_SECRET=$(rand 48)
SETUP_CODE=$SETUP_CODE
DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL
APP_URL=$APP_URL
APP_PORT=$APP_PORT
APP_BIND=$APP_BIND
COMPOSE_PROFILES=$PROFILES
MAX_UPLOAD_MB=50
BACKUP_KEEP=14
UPDATE_FEED_URL=$FEED
EOF
umask 022
mkdir -p backups && chmod 700 backups
chmod +x lms.sh docker-entrypoint.sh
info "Saved settings to .env"

# ---------------------------------------------------------------- 4. Firewall
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ask "The firewall (ufw) is on. Allow port(s) $NEED_PORTS? (y/n)" "y"
  if [ "$REPLY" = y ]; then for p in $NEED_PORTS; do ufw allow "$p"/tcp >/dev/null; done; info "Firewall: allowed $NEED_PORTS"; fi
fi

# ---------------------------------------------------------------- 5. Build / pull and start
bold "Starting Campus LMS (the first build takes a few minutes)..."
if [ -n "$IMAGE" ]; then
  docker compose pull app
  docker compose up -d --no-build
else
  docker compose up -d --build
fi

printf "Waiting for the app to start"
ok=0
for _ in $(seq 1 120); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then ok=1; echo; break; fi
  printf "."; sleep 2
done
[ "$ok" = 1 ] || { echo; fail "The app didn't start. See: docker compose logs app"; }

# ---------------------------------------------------------------- 6. The "lms" command and nightly backups
if [ "$IS_ROOT" = 1 ]; then
  ln -sf "$PWD/lms.sh" /usr/local/bin/lms
  info "Installed the 'lms' command (try: lms status)"
  if [ "$BACKUPS" = 1 ] && [ -d /etc/cron.d ]; then
    cat > /etc/cron.d/campus-lms <<EOF
# Campus LMS nightly backup (database + uploaded files), keeps the newest \$BACKUP_KEEP
30 2 * * * root cd $PWD && ./lms.sh backup nightly >> $PWD/backups/backup.log 2>&1
EOF
    chmod 644 /etc/cron.d/campus-lms
    info "Nightly backups at 02:30 into $PWD/backups"
  fi
fi

if [ -n "$DOMAIN" ]; then URL="https://$DOMAIN/setup"; else
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; URL="http://${IP:-localhost}:$APP_PORT/setup"
fi
echo
bold "Campus LMS $VERSION is running."
echo "  1. Open:        $URL"
echo "  2. Setup code:  $SETUP_CODE"
echo
echo "Manage it with:  lms status | lms logs | lms backup | lms update | lms help"
echo "Keep a copy of .env somewhere safe (it holds the database password and encryption key)."
