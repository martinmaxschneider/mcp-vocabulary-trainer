#!/bin/sh
set -e

echo "Starting Sprachen App..."

DB_FILE="${DATABASE_URL#file:}"
# Absolute path in container; Prisma also accepts file:/app/data/sprachen.db
if [ -z "$DB_FILE" ] || [ "$DB_FILE" = "$DATABASE_URL" ]; then
  DB_FILE="/app/data/sprachen.db"
fi

mkdir -p "$(dirname "$DB_FILE")"

echo "Syncing database schema..."
node_modules/.bin/prisma db push

echo "Database ready at $DB_FILE"
echo "Starting Next.js server on port 4800..."

exec node server.js
