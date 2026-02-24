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

-- Drop old policies that might be blocking inserts
DROP POLICY IF EXISTS "Users can insert their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can insert their own leads" ON leads;

-- Create new ones with correct permissions
CREATE POLICY "Users can insert their own search history"
  ON search_history FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own leads"
  ON leads FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Also allow updates
CREATE POLICY "Users can update their own search history"
  ON search_history FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own leads"
  ON leads FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
