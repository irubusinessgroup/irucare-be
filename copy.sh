#!/bin/bash
set -e

# Script to copy data from source PostgreSQL database to target database
# REMOTE_DATABASE_URL="postgresql://postgres:hBKxPjNTfGRQjrEiSiEkknhGpXgMlqqO@nozomi.proxy.rlwy.net:53688/railway"
# LOCAL_DATABASE_URL="postgresql://wilsondev:password@localhost:5432/healthlinker-db?schema=public"

# Set source connection details (LOCAL server)
SOURCE_HOST="localhost"
SOURCE_PORT="5432"
SOURCE_USER="wilsondev"
SOURCE_PASSWORD="password"
SOURCE_DB="healthlinker-db"

# Set target connection details (REMOTE Railway server)
TARGET_HOST="nozomi.proxy.rlwy.net"
TARGET_PORT="53688"
TARGET_USER="postgres"
TARGET_PASSWORD="hBKxPjNTfGRQjrEiSiEkknhGpXgMlqqO"
TARGET_DB="railway"

echo "🚀 Starting database migration..."
echo "📤 Source: $SOURCE_HOST:$SOURCE_PORT/$SOURCE_DB"
echo "📥 Target: $TARGET_HOST:$TARGET_PORT/$TARGET_DB"
echo ""

# Step 1: Dump data from source
echo "1️⃣  Dumping data from source server..."
PGPASSWORD="$SOURCE_PASSWORD" pg_dump \
  -h "$SOURCE_HOST" \
  -p "$SOURCE_PORT" \
  -U "$SOURCE_USER" \
  -d "$SOURCE_DB" \
  --data-only \
  --inserts \
  --no-owner \
  --no-privileges \
  > /tmp/data_migration.sql

if [ $? -eq 0 ]; then
  echo "✅ Dump successful"
else
  echo "❌ Dump failed"
  exit 1
fi

# Step 2: Modify INSERT statements to handle duplicates
echo "2️⃣  Modifying INSERT statements to handle conflicts..."
sed -i '/^INSERT/s/;$/ ON CONFLICT DO NOTHING;/' /tmp/data_migration.sql
echo "✅ Modification complete"

# Step 3: Restore data to target
echo "3️⃣  Restoring data to target server..."
PGPASSWORD="$TARGET_PASSWORD" psql \
  -h "$TARGET_HOST" \
  -p "$TARGET_PORT" \
  -U "$TARGET_USER" \
  -d "$TARGET_DB" \
  -f /tmp/data_migration.sql

if [ $? -eq 0 ]; then
  echo "✅ Restore successful"
else
  echo "❌ Restore failed"
  rm /tmp/data_migration.sql
  exit 1
fi

# Step 4: Cleanup
echo "4️⃣  Cleaning up..."
rm /tmp/data_migration.sql
echo "✅ Cleanup complete"

echo ""
echo "✅ Data migration completed successfully!"
echo "📊 Source: $SOURCE_HOST:$SOURCE_PORT/$SOURCE_DB"
echo "📊 Target: $TARGET_HOST:$TARGET_PORT/$TARGET_DB"
echo ""
echo "Next steps:"
echo "  1. Verify data in new database"
echo "  2. Run: ./deploy.sh (to redeploy with migrated data)"