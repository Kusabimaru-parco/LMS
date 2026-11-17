#!/usr/bin/env bash
# Campus LMS management command (Linux / Docker). Installed as "lms" by install.sh.
#
#   lms status                     containers, version and health
#   lms logs                       follow the app's logs
#   lms start | stop | restart
#   lms backup [label]             database + uploaded files + .env into ./backups (keeps BACKUP_KEEP)
#   lms restore <file.dump>        restore a backup (asks for confirmation)
#   lms update [--from FILE|DIR] [--version X]
#                                  install a new version: build, back up, switch, check health,
#                                  and roll back automatically if the new version doesn't start
#   lms rollback                   go back to the version before the last update (code + database)
#   lms version                    show the installed version
#   lms setup-code                 show the first-run setup code
set -euo pipefail
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
cd "$DIR"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33mWarning:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f .env ] || fail "Campus LMS isn't installed in $DIR (no .env). Run ./install.sh first."
set -a; . ./.env; set +a
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-campus-lms}"
STATE=".update"
mkdir -p backups "$STATE"; chmod 700 backups

dc() { docker compose "$@"; }
set_env() { # set_env KEY value  (rewrites .env in place)
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
  export "$1=$2"
}
pkg_version() { sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "${1:-.}/package.json" | head -1; }

healthy() { # waits up to $1 seconds for /api/health
  local tries=$(( ${1:-180} / 3 ))
  for _ in $(seq 1 "$tries"); do
    if dc exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>process.exit(j.status==='ok'?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

running_version() {
  dc exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>console.log(j.version)).catch(()=>console.log('not running'))" 2>/dev/null || echo "not running"
}

start_app() {
  if [ "${LMS_IMAGE:-campus-lms}" != "campus-lms" ]; then dc up -d --no-build; else dc up -d; fi
}

# ---------------------------------------------------------------- backup / restore
do_backup() {
  local label="${1:-manual}" ts base
  ts="$(date +%Y%m%d-%H%M%S)"
  base="backups/campus-lms-${LMS_VERSION:-unknown}-${ts}-${label}"
  bold "Backing up to ${base}.*"
  dc exec -T db pg_dump -U lms -d campus_lms -Fc > "${base}.dump"
  [ -s "${base}.dump" ] || fail "The database backup is empty."
  if dc exec -T app true >/dev/null 2>&1; then
    dc exec -T app tar czf - -C /app/data uploads > "${base}-uploads.tar.gz"
  else
    dc run --rm --no-deps -T --entrypoint tar app czf - -C /app/data uploads > "${base}-uploads.tar.gz"
  fi
  cp .env "${base}.env"
  chmod 600 "${base}".* 2>/dev/null || true
  info "Database: $(du -h "${base}.dump" | cut -f1) · files: $(du -h "${base}-uploads.tar.gz" | cut -f1)"
  # Keep the newest BACKUP_KEEP backups (pre-update backups are kept too, but count toward the limit)
  local keep="${BACKUP_KEEP:-14}"
  ls -1t backups/campus-lms-*.dump 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do
    rm -f "$old" "${old%.dump}-uploads.tar.gz" "${old%.dump}.env"
  done
  LAST_BACKUP="$base"
}

do_restore() {
  local file="${1:-}"
  [ -n "$file" ] && [ -f "$file" ] || fail "Usage: lms restore backups/<name>.dump   (see: ls backups)"
  local base="${file%.dump}"
  if [ "${2:-}" != "--yes" ]; then
    warn "This replaces ALL current data with the backup $file."
    read -r -p "Type RESTORE to continue: " c; [ "$c" = RESTORE ] || fail "Cancelled."
  fi
  bold "Restoring $file"
  dc stop app >/dev/null
  dc exec -T db psql -U lms -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS campus_lms WITH (FORCE);" \
    -c "CREATE DATABASE campus_lms OWNER lms ENCODING 'UTF8';" >/dev/null
  dc exec -T db pg_restore -U lms -d campus_lms --no-owner --exit-on-error < "$file"
  if [ -f "${base}-uploads.tar.gz" ]; then
    dc run --rm --no-deps -T --entrypoint sh app -c 'rm -rf /app/data/uploads/* && tar xzf - -C /app/data' < "${base}-uploads.tar.gz"
    info "Uploaded files restored."
  fi
  start_app >/dev/null
  healthy 180 && bold "Restore finished." || fail "Restored, but the app didn't start. See: lms logs"
}

# ---------------------------------------------------------------- update / rollback
do_update() {
  local from="" target=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --from) from="${2:-}"; shift 2 ;;
      --version) target="${2:-}"; shift 2 ;;
      *) fail "Unknown option $1. Usage: lms update [--from release.tar.gz|folder] [--version X]" ;;
    esac
  done
  local old="${LMS_VERSION:-unknown}" image="${LMS_IMAGE:-campus-lms}" new
  bold "Updating Campus LMS (current version $old)"

  # 1. Remember how to go back
  echo "$old" > "$STATE/previous-version"
  tar czf "$STATE/previous-source.tar.gz" --exclude=./backups --exclude=./.update --exclude=./.env --exclude=./node_modules --exclude=./.git . 2>/dev/null

  # 2. Get the new version (the running app is not touched yet)
  if [ "$image" != "campus-lms" ]; then
    [ -n "$target" ] || fail "With prebuilt images, say which version: lms update --version 1.2.0"
    new="$target"
    set_env LMS_VERSION "$new"
    dc pull app || { set_env LMS_VERSION "$old"; fail "Couldn't download version $new."; }
  else
    if [ -n "$from" ]; then
      local tmp; tmp="$(mktemp -d)"
      if [ -d "$from" ]; then cp -a "$from/." "$tmp/"; else tar xzf "$from" -C "$tmp"; fi
      local src="$tmp"; [ -f "$tmp/package.json" ] || src="$(dirname "$(find "$tmp" -maxdepth 2 -name package.json | head -1)")"
      [ -f "$src/package.json" ] || fail "$from doesn't contain Campus LMS."
      new="$(pkg_version "$src")"
      rm -rf "$src/.env" "$src/backups"
      cp -a "$src/." "$DIR/"
      rm -rf "$tmp"
    elif [ -d .git ]; then
      git fetch --tags --quiet
      local tag="${target:+v$target}"; tag="${tag:-$(git describe --tags --abbrev=0 origin/HEAD 2>/dev/null || git tag --sort=-v:refname | head -1)}"
      [ -n "$tag" ] || fail "No release tags found. Use: lms update --from campus-lms-X.Y.Z.tar.gz"
      git checkout --quiet "$tag"
      new="$(pkg_version .)"
    else
      fail "Download the new release first, then: lms update --from campus-lms-X.Y.Z.tar.gz"
    fi
    chmod +x lms.sh install.sh docker-entrypoint.sh 2>/dev/null || true
    [ "$new" != "$old" ] || warn "Version $new is already installed; rebuilding it."
    set_env LMS_VERSION "$new"
    bold "Building version $new (the current version keeps running meanwhile)..."
    if ! dc build app; then
      warn "The build failed. Putting the previous files back."
      tar xzf "$STATE/previous-source.tar.gz"; set_env LMS_VERSION "$old"
      fail "Update cancelled. Nothing was changed."
    fi
  fi

  # 3. Back up right before switching, so the backup has the latest data
  do_backup "before-$new"
  echo "$LAST_BACKUP" > "$STATE/previous-backup"

  # 4. Switch. Database migrations run automatically when the new version starts.
  bold "Switching to version $new..."
  start_app
  if healthy 240 && [ "$(running_version | tr -d '\r')" = "$new" ]; then
    bold "Updated to Campus LMS $new."
    info "If anything looks wrong, run: lms rollback"
  else
    warn "Version $new didn't start correctly. Rolling back to $old automatically."
    dc logs --tail 60 app >&2 || true
    do_rollback --yes
    fail "The update was rolled back. Nothing was lost. Send the log above to support."
  fi
}

do_rollback() {
  [ -f "$STATE/previous-version" ] || fail "There's no previous version to go back to."
  local prev backup; prev="$(cat "$STATE/previous-version")"; backup="$(cat "$STATE/previous-backup" 2>/dev/null || true)"
  if [ "${1:-}" != "--yes" ]; then
    warn "This goes back to version $prev and restores the database from just before the update ($backup)."
    warn "Anything people did after the update will be lost."
    read -r -p "Type ROLLBACK to continue: " c; [ "$c" = ROLLBACK ] || fail "Cancelled."
  fi
  [ -f "$STATE/previous-source.tar.gz" ] && tar xzf "$STATE/previous-source.tar.gz"
  set_env LMS_VERSION "$prev"
  # The previous image is still on this server (tagged with its version), so no rebuild is needed.
  if ! docker image inspect "${LMS_IMAGE:-campus-lms}:$prev" >/dev/null 2>&1; then
    if [ "${LMS_IMAGE:-campus-lms}" = "campus-lms" ]; then dc build app; else dc pull app; fi
  fi
  if [ -n "$backup" ] && [ -f "$backup.dump" ]; then
    do_restore "$backup.dump" --yes
  else
    start_app; healthy 180 || fail "Rolled back the code, but the app didn't start. See: lms logs"
  fi
  bold "Back on Campus LMS $prev."
}

# ---------------------------------------------------------------- commands
cmd="${1:-help}"; shift || true
case "$cmd" in
  status)
    dc ps
    echo; info "Installed version: ${LMS_VERSION:-unknown} (${LMS_IMAGE:-campus-lms})"
    info "Running version:   $(running_version)"
    info "Backups: $(ls -1 backups/*.dump 2>/dev/null | wc -l) in $DIR/backups, newest: $(ls -1t backups/*.dump 2>/dev/null | head -1 || echo none)"
    ;;
  logs) dc logs -f --tail=200 app ;;
  start) start_app ;;
  stop) dc stop ;;
  restart) dc restart app ;;
  backup) do_backup "${1:-manual}" ;;
  restore) do_restore "${1:-}" "${2:-}" ;;
  update) do_update "$@" ;;
  rollback) do_rollback "${1:-}" ;;
  version) echo "${LMS_VERSION:-unknown}" ;;
  setup-code) grep '^SETUP_CODE=' .env | cut -d= -f2 ;;
  help|-h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) fail "Unknown command '$cmd'. Run: lms help" ;;
esac
