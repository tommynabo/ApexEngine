-- ========================================
-- TRIGGER: Auto-create profile on user signup
-- ========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.user_metadata->>'full_name');
  RETURN new;
END;
$$;

-- Drop trigger if exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- TAMBIÉN CREA CONFIGURACIÓN POR DEFECTO
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
-- FIX RLS POLICIES - Permitir inserciones
-- ========================================

-- Drop existing policies (idempotent - no error si no existen)
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can insert their own leads" ON leads;
DROP POLICY IF EXISTS "Users can update their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can update their own leads" ON leads;
DROP POLICY IF EXISTS "Users can view their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can view their own leads" ON leads;
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
DROP POLICY IF EXISTS "Users can view their own deduplication log" ON deduplication_log;
DROP POLICY IF EXISTS "Public can read system prompts" ON system_prompts;

-- ========================================
-- PROFILES: SELECT, INSERT, UPDATE
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
-- SEARCH_HISTORY: SELECT, INSERT, UPDATE
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
-- LEADS: SELECT, INSERT, UPDATE
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
-- SEARCH_CRITERIA: SELECT, INSERT, UPDATE
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
-- MESSAGE_TEMPLATES: SELECT, INSERT, UPDATE
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
-- DAILY_CONTACT_LOG: SELECT, INSERT
-- ========================================
CREATE POLICY "Users can view their own contact log"
  ON daily_contact_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contact log"
  ON daily_contact_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- USER_CONFIGURATION: ALL
-- ========================================
CREATE POLICY "Users can view and update their own config"
  ON user_configuration FOR ALL USING (auth.uid() = user_id);

-- ========================================
-- API_USAGE_TRACKING: SELECT
-- ========================================
CREATE POLICY "Users can view their own usage"
  ON api_usage_tracking FOR SELECT USING (auth.uid() = user_id);

-- ========================================
-- DEDUPLICATION_LOG: SELECT
-- ========================================
CREATE POLICY "Users can view their own deduplication log"
  ON deduplication_log FOR SELECT USING (auth.uid() = user_id);

-- ========================================
-- SYSTEM_PROMPTS: Public read
-- ========================================
CREATE POLICY "Public can read system prompts"
  ON system_prompts FOR SELECT USING (true);

-- ========================================
-- BACKFILL: Create profiles for ALL existing auth users
-- who don't have a profile yet
-- ========================================
INSERT INTO public.profiles (id, email, full_name)
SELECT 
  au.id, 
  au.email, 
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;
