-- ========================================
-- APEX ENGINE - COMPLETE SUPABASE SETUP
-- Includes: Tables, RLS, Triggers, Policies
-- ========================================

-- ========================================
-- 1. ENABLE RLS ON ALL TABLES
-- ========================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_contact_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE deduplication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_prompts ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 2. TRIGGER: Auto-create profile on user signup
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.user_metadata->>'full_name')
  ON CONFLICT (id) DO UPDATE 
  SET email = new.email, updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- 3. TRIGGER: Create default config on profile creation
-- ========================================
CREATE OR REPLACE FUNCTION public.create_default_config()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_configuration (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created ON profiles;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_default_config();

-- ========================================
-- 4. DROP ALL EXISTING POLICIES (IDEMPOTENT)
-- ========================================
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can insert their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can update their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can view their own leads" ON leads;
DROP POLICY IF EXISTS "Users can insert their own leads" ON leads;
DROP POLICY IF EXISTS "Users can update their own leads" ON leads;
DROP POLICY IF EXISTS "Users can view their own search criteria" ON search_criteria;
DROP POLICY IF EXISTS "Users can insert their own search criteria" ON search_criteria;
DROP POLICY IF EXISTS "Users can update their own search criteria" ON search_criteria;
DROP POLICY IF EXISTS "Users can view their own messages" ON message_templates;
DROP POLICY IF EXISTS "Users can insert their own messages" ON message_templates;
DROP POLICY IF EXISTS "Users can update their own messages" ON message_templates;
DROP POLICY IF EXISTS "Users can view their own contact log" ON daily_contact_log;
DROP POLICY IF EXISTS "Users can insert their own contact log" ON daily_contact_log;
DROP POLICY IF EXISTS "Users can view and update their own config" ON user_configuration;
DROP POLICY IF EXISTS "Users can view their own usage" ON api_usage_tracking;
DROP POLICY IF EXISTS "Users can insert their own usage" ON api_usage_tracking;
DROP POLICY IF EXISTS "Users can update their own usage" ON api_usage_tracking;
DROP POLICY IF EXISTS "Users can view their own deduplication log" ON deduplication_log;
DROP POLICY IF EXISTS "Users can insert their own deduplication log" ON deduplication_log;
DROP POLICY IF EXISTS "Public can read system prompts" ON system_prompts;

-- ========================================
-- 5. PROFILES: SELECT, INSERT, UPDATE
-- ========================================
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ========================================
-- 6. SEARCH_HISTORY: SELECT, INSERT, UPDATE
-- ========================================
CREATE POLICY "Users can view their own search history"
  ON search_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search history"
  ON search_history FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own search history"
  ON search_history FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 7. LEADS: SELECT, INSERT, UPDATE
-- ========================================
CREATE POLICY "Users can view their own leads"
  ON leads FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own leads"
  ON leads FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own leads"
  ON leads FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 8. SEARCH_CRITERIA: SELECT, INSERT, UPDATE
-- ========================================
CREATE POLICY "Users can view their own search criteria"
  ON search_criteria FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search criteria"
  ON search_criteria FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own search criteria"
  ON search_criteria FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 9. MESSAGE_TEMPLATES: SELECT, INSERT, UPDATE
-- ========================================
CREATE POLICY "Users can view their own messages"
  ON message_templates FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages"
  ON message_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages"
  ON message_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 10. DAILY_CONTACT_LOG: SELECT, INSERT, UPDATE
-- ========================================
CREATE POLICY "Users can view their own contact log"
  ON daily_contact_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contact log"
  ON daily_contact_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contact log"
  ON daily_contact_log FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 11. USER_CONFIGURATION: SELECT, INSERT, UPDATE, DELETE
-- ========================================
CREATE POLICY "Users can view their own config"
  ON user_configuration FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own config"
  ON user_configuration FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own config"
  ON user_configuration FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own config"
  ON user_configuration FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================
-- 12. API_USAGE_TRACKING: SELECT, INSERT, UPDATE
-- ========================================
CREATE POLICY "Users can view their own usage"
  ON api_usage_tracking FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage"
  ON api_usage_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage"
  ON api_usage_tracking FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 13. DEDUPLICATION_LOG: SELECT, INSERT
-- ========================================
CREATE POLICY "Users can view their own deduplication log"
  ON deduplication_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deduplication log"
  ON deduplication_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 14. SYSTEM_PROMPTS: Public read (anyone can view)
-- ========================================
CREATE POLICY "Public can read system prompts"
  ON system_prompts FOR SELECT USING (true);

-- ========================================
-- 15. CREATE INDEXES FOR PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_search_id ON leads(search_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_executed_at ON search_history(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_criteria_user_id ON search_criteria(user_id);

-- ========================================
-- 16. BACKFILL: Create profiles for existing auth users
-- ========================================
INSERT INTO public.profiles (id, email, full_name)
SELECT 
  au.id, 
  au.email, 
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- 17. BACKFILL: Create default config for existing users
-- ========================================
INSERT INTO public.user_configuration (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- ========================================
-- SETUP COMPLETE
-- ========================================
-- All tables are now properly configured with RLS, triggers, and policies.
-- Users can only access their own data.
