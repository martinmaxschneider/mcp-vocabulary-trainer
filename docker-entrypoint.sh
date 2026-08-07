#!/bin/sh
set -e

echo "Starting Sprachen App..."

DB_FILE="${DATABASE_URL#file:}"
# Absolute path in container; Prisma also accepts file:/app/data/sprachen.db
if [ -z "$DB_FILE" ] || [ "$DB_FILE" = "$DATABASE_URL" ]; then
  DB_FILE="/app/data/sprachen.db"
fi

mkdir -p "$(dirname "$DB_FILE")"
mkdir -p /app/data/backups

echo "Applying database migrations (with backup if DB exists)..."
node scripts/db-migrate.mjs

echo "Database ready at $DB_FILE"
echo "Starting Next.js server on port 4810..."

exec node server.js
