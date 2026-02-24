#!/bin/bash
# ApexEngine - Initialize Supabase Schema
# This script applies the new schema to your Supabase project
# 
# Usage: bash deploy-schema.sh
#
# Before running:
# 1. Make sure you have supabase CLI installed: brew install supabase/tap/supabase
# 2. Run: supabase link --project-ref biltmzurmhvgdprpekoa
# 3. Then run this script

echo "🚀 ApexEngine - Supabase Schema Deployment"
echo "==========================================="
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it with:"
    echo "   brew install supabase/tap/supabase"
    exit 1
fi

# Check if SUPABASE_DB_PASSWORD is set (required)
if [ -z "$SUPABASE_DB_PASSWORD" ]; then
    echo "⚠️  SUPABASE_DB_PASSWORD not set. You may need to provide it when prompted."
fi

echo "📝 Deploying schema to: biltmzurmhvgdprpekoa"
echo ""

# Apply the migration
supabase migration up --db-url "postgresql://postgres:${SUPABASE_DB_PASSWORD:-password}@db.biltmzurmhvgdprpekoa.supabase.co:6543/postgres"

# Alternative: If using Edge Functions or direct psql
# psql "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.biltmzurmhvgdprpekoa.supabase.co:6543/postgres" < supabase/apex_engine_schema.sql

echo ""
echo "✅ Schema deployment complete!"
echo ""
echo "📊 Tables created:"
echo "   - profiles"
echo "   - search_criteria"
echo "   - search_history"
echo "   - leads"
echo "   - message_templates"
echo "   - daily_contact_log"
echo "   - system_prompts"
echo "   - deduplication_log"
echo "   - api_usage_tracking"
echo "   - user_configuration"
echo ""
echo "🔐 Row-level security (RLS) configured for all tables"
echo ""
echo "Next steps:"
echo "1. Test the connection in your app"
echo "2. Create a test user if needed"
echo "3. Run: npm run dev"
