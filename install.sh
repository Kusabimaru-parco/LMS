#!/usr/bin/env bash
# Campus LMS installer for your own server (Linux with Docker).
# Usage:  ./install.sh
# It asks two questions, generates secure secrets, starts everything and prints your setup code.
set -euo pipefail

cd "$(dirname "$0")"
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

bold "Campus LMS installer"
echo

# 1. Requirements
command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install it from https://docs.docker.com/engine/install/ and run this again."
docker compose version >/dev/null 2>&1 || fail "The Docker Compose plugin is missing. Install 'docker-compose-plugin' and run this again."
docker info >/dev/null 2>&1 || fail "Docker is installed but not running, or this user can't use it. Try: sudo ./install.sh"

if [ -f .env ]; then
  fail ".env already exists, so Campus LMS looks installed already. To update, run: docker compose up -d --build"
fi

# 2. Questions
echo "Do you have a domain name pointing to this server (for example lms.yourschool.edu)?"
echo "If yes, HTTPS is set up automatically. Leave it empty to use http://<server-ip>:3000."
read -r -p "Domain (optional): " DOMAIN
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%/}"

APP_PORT=3000
if [ -z "$DOMAIN" ]; then
  read -r -p "Port to use [3000]: " p
  APP_PORT="${p:-3000}"
  [[ "$APP_PORT" =~ ^[0-9]+$ ]] || fail "Port must be a number."
fi

# 3. Secrets
# Subshells with pipefail off: `head` closing the pipe early must not abort the script.
rand() ( set +o pipefail; head -c 256 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c "$1" )
code_part() ( set +o pipefail; head -c 512 /dev/urandom | tr -dc 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' | head -c 4 )
POSTGRES_PASSWORD="$(rand 32)"
AUTH_SECRET="$(rand 48)"
SETUP_CODE="$(code_part)-$(code_part)-$(code_part)"

if [ -n "$DOMAIN" ]; then
  APP_URL="https://$DOMAIN"; APP_BIND="127.0.0.1"; PROFILES="https"
else
  APP_URL=""; APP_BIND="0.0.0.0"; PROFILES=""
fi

umask 077
cat > .env <<EOF
# Created by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Keep this file private and back it up:
# without AUTH_SECRET, stored integration passwords can't be decrypted.
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
AUTH_SECRET=$AUTH_SECRET
SETUP_CODE=$SETUP_CODE
DOMAIN=$DOMAIN
APP_URL=$APP_URL
APP_PORT=$APP_PORT
APP_BIND=$APP_BIND
COMPOSE_PROFILES=$PROFILES
EOF
echo "Saved settings to .env"

# 4. Start
bold "Building and starting Campus LMS (the first time takes a few minutes)..."
docker compose up -d --build

# 5. Wait until healthy
printf "Waiting for the app to start"
for _ in $(seq 1 90); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo; break
  fi
  printf "."; sleep 2
done

if [ -n "$DOMAIN" ]; then URL="https://$DOMAIN/setup"; else
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; URL="http://${IP:-localhost}:$APP_PORT/setup"
fi

echo
bold "Campus LMS is running."
echo "  1. Open:        $URL"
echo "  2. Setup code:  $SETUP_CODE"
echo
echo "Logs:   docker compose logs -f app"
echo "Stop:   docker compose down"
