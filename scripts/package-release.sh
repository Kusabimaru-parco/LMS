#!/usr/bin/env bash
# Builds the files you give to schools for one release, into dist/:
#   campus-lms-X.Y.Z.tar.gz   Linux servers   (lms update --from campus-lms-X.Y.Z.tar.gz)
#   campus-lms-X.Y.Z.zip      Windows servers (update-windows.cmd C:\path\campus-lms-X.Y.Z.zip)
#   latest.json               the update feed (host it at UPDATE_FEED_URL)
#   SHA256SUMS                checksums, so schools can verify downloads
# Usage: npm run release            (uses the committed state of HEAD when the tree is clean)
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(node -p "require('./package.json').version")"
NAME="campus-lms-$VERSION"
NOTES="${RELEASE_NOTES:-See CHANGELOG.md}"
SECURITY="${RELEASE_SECURITY:-false}"
URL="${RELEASE_URL:-}"
mkdir -p dist
rm -f "dist/$NAME.tar.gz" "dist/$NAME.zip"

if [ -z "$(git status --porcelain 2>/dev/null)" ] && git rev-parse HEAD >/dev/null 2>&1; then
  git archive --format=tar.gz --prefix="$NAME/" -o "dist/$NAME.tar.gz" HEAD
  git archive --format=zip --prefix="$NAME/" -o "dist/$NAME.zip" HEAD
else
  echo "Warning: uncommitted changes, packaging the working folder instead of a commit." >&2
  EXCLUDES=(--exclude=./node_modules --exclude=./.next --exclude=./.git --exclude=./.pgdata --exclude=./dist --exclude=./data
            --exclude=./backups --exclude=./logs --exclude=./.update --exclude='./.env' --exclude='./.env.local' --exclude='./deploy/baas/*.env'
            --exclude='*.tsbuildinfo' --exclude=./next-env.d.ts)
  tar czf "dist/$NAME.tar.gz" "${EXCLUDES[@]}" --transform "s,^\.,$NAME," .
  tmp="$(mktemp -d)"; mkdir -p "$tmp/$NAME"; tar xzf "dist/$NAME.tar.gz" -C "$tmp"
  (cd "$tmp" && (command -v zip >/dev/null && zip -qr "$OLDPWD/dist/$NAME.zip" "$NAME" || powershell.exe -NoProfile -Command "Compress-Archive -Path '$NAME' -DestinationPath '$(cygpath -w "$OLDPWD/dist/$NAME.zip" 2>/dev/null || echo "$OLDPWD/dist/$NAME.zip")'"))
  rm -rf "$tmp"
fi

cat > dist/latest.json <<EOF
{
  "version": "$VERSION",
  "date": "$(date -u +%Y-%m-%d)",
  "notes": "$NOTES",
  "security": $SECURITY${URL:+,
  "url": "$URL"}
}
EOF
(cd dist && (sha256sum "$NAME.tar.gz" "$NAME.zip" 2>/dev/null || shasum -a 256 "$NAME.tar.gz" "$NAME.zip") > SHA256SUMS)
ls -la dist
echo "Release $VERSION ready in dist/."
