#!/bin/sh
# Applies any pending database migrations, then starts the web server.
# Running migrations on every start makes upgrades a matter of "pull new version, restart".
set -e

echo "[campus-lms] Applying database migrations..."
prisma migrate deploy --schema ./prisma/schema.prisma

echo "[campus-lms] Starting server on port ${PORT:-3000}"
exec node server.js
