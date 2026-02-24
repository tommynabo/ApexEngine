-- ========================================
-- APEX ENGINE - NEW SCHEMA
-- Project: Inmobiliarias LinkedIN Scraper
-- Client: Marcos
-- Database: biltmzurmhvgdprpekoa
-- ========================================

-- 1. PROFILES TABLE (Users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);


-- 2. SEARCH CRITERIA TABLE (Store search filters)
CREATE TABLE IF NOT EXISTS search_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g., "Inmobiliarias España"
  location TEXT DEFAULT 'España',
  industry TEXT DEFAULT 'Real Estate',
  job_titles TEXT[] DEFAULT ARRAY['CEO', 'Fundador', 'Socio Fundador', 'Owner', 'Propietario', 'Director General', 'Gerente', 'Managing Director'],
  exclude_titles TEXT[] DEFAULT ARRAY['Agente', 'Asesor', 'Comercial', 'Consultor', 'Franquiciado'],
  company_sizes TEXT[] DEFAULT ARRAY['1-10', '11-50', '51-200'],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE search_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own search criteria"
  ON search_criteria FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search criteria"
  ON search_criteria FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own search criteria"
  ON search_criteria FOR UPDATE USING (auth.uid() = user_id);


-- 3. SEARCH HISTORY TABLE (Track all searches)
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  criteria_id UUID REFERENCES search_criteria(id) ON DELETE SET NULL,
  search_query TEXT NOT NULL,
  source TEXT DEFAULT 'linkedin', -- 'linkedin', 'google', etc
  mode TEXT DEFAULT 'fast', -- 'fast', 'deep'
  total_results INTEGER DEFAULT 0,
  results_extracted INTEGER DEFAULT 0,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed'
  error_log TEXT
);

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own search history"
  ON search_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search history"
  ON search_history FOR INSERT WITH CHECK (auth.uid() = user_id);


-- 4. LEADS TABLE (Prospects scraped)
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  search_id UUID REFERENCES search_history(id) ON DELETE SET NULL,
  
  -- Contact Info
  name TEXT NOT NULL,
  job_title TEXT,
  company_name TEXT,
  company_website TEXT,
  company_size TEXT,
  industry TEXT,
  location TEXT,
  
  -- Social Profiles
  linkedin_url TEXT,
  linkedin_profile_id TEXT,
  email TEXT,
  phone TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  
  -- AI Analysis
  ai_summary TEXT,
  ai_pain_points TEXT[],
  ai_business_moment TEXT,
  ai_is_npl_potential BOOLEAN DEFAULT false,
  
  -- Status & Actions
  status TEXT DEFAULT 'scraped', -- 'scraped', 'enriched', 'ready', 'contacted', 'replied', 'discarded'
  contacted_at TIMESTAMP WITH TIME ZONE,
  reply_received_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own leads"
  ON leads FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own leads"
  ON leads FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own leads"
  ON leads FOR UPDATE USING (auth.uid() = user_id);

-- Create index for faster searches
CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);


-- 5. MESSAGE TEMPLATES TABLE (Store AI-generated messages)
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Message Variants
  message_type TEXT NOT NULL, -- 'generic', 'npl', 'custom'
  message_a_generic TEXT NOT NULL, -- Generic automation message
  message_b_npl TEXT, -- NPL-focused message (if applicable)
  
  -- Metadata
  prompt_used TEXT, -- The prompt that was used to generate these messages
  model_used TEXT DEFAULT 'gpt-4o-mini',
  tokens_used INTEGER,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Usage tracking
  message_selected TEXT, -- Which message was used ('a', 'b', or null if not sent yet)
  sent_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own messages"
  ON message_templates FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages"
  ON message_templates FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages"
  ON message_templates FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_message_templates_lead_id ON message_templates(lead_id);
CREATE INDEX idx_message_templates_user_id ON message_templates(user_id);


-- 6. DAILY CONTACT LOG TABLE (Track Marcos' 25/day manual contacts)
CREATE TABLE IF NOT EXISTS daily_contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE SET NULL,
  
  contact_date DATE NOT NULL DEFAULT CURRENT_DATE,
  contacted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  message_type TEXT, -- 'generic', 'npl'
  message_sent TEXT,
  
  -- Response tracking
  invitation_response TEXT, -- 'pending', 'accepted', 'rejected'
  response_received_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

ALTER TABLE daily_contact_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own contact log"
  ON daily_contact_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contact log"
  ON daily_contact_log FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_daily_contact_log_user_date ON daily_contact_log(user_id, contact_date);


-- 7. SYSTEM PROMPTS TABLE (Store and version AI prompts)
CREATE TABLE IF NOT EXISTS system_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  prompt_key TEXT UNIQUE NOT NULL, -- e.g., 'profile_analysis', 'message_generation'
  prompt_type TEXT NOT NULL, -- 'system', 'user'
  prompt_content TEXT NOT NULL,
  language TEXT DEFAULT 'es',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1
);

ALTER TABLE system_prompts ENABLE ROW LEVEL SECURITY;

-- No row-level security needed for system prompts, they're global
CREATE POLICY "Public can read system prompts"
  ON system_prompts FOR SELECT USING (true);


-- 8. DEDUPLICATION LOG TABLE (Track duplicates found & merged)
CREATE TABLE IF NOT EXISTS deduplication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  lead_id_primary UUID REFERENCES leads(id) ON DELETE SET NULL,
  lead_id_duplicate UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  match_type TEXT NOT NULL, -- 'email', 'phone', 'linkedin_profile', 'name_company'
  confidence_score FLOAT,
  action TEXT DEFAULT 'merged', -- 'merged', 'marked_duplicate', 'manual_review'
  
  merged_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE deduplication_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deduplication log"
  ON deduplication_log FOR SELECT USING (auth.uid() = user_id);


-- 9. API USAGE TRACKING TABLE (Monitor Apify, OpenAI costs)
CREATE TABLE IF NOT EXISTS api_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  service_name TEXT NOT NULL, -- 'apify', 'openai', 'linkedin'
  operation TEXT, -- 'search', 'enrichment', 'profile_analysis'
  
  api_call_count INTEGER DEFAULT 1,
  tokens_used INTEGER DEFAULT 0,
  cost_estimate DECIMAL(10, 4),
  
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  date_recorded DATE DEFAULT CURRENT_DATE
);

ALTER TABLE api_usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
  ON api_usage_tracking FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_api_usage_user_date ON api_usage_tracking(user_id, date_recorded);


-- 10. CONFIGURATION TABLE (Per-user settings)
CREATE TABLE IF NOT EXISTS user_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Pagination & Scraping Strategy
  daily_limit_contacts INTEGER DEFAULT 25, -- Marcos' manual limit
  batch_size_scraping INTEGER DEFAULT 10, -- Leads per batch
  scraping_batches_strategy TEXT DEFAULT 'provincial', -- 'provincial', 'alphabetical', 'random'
  
  -- NPL Detection Toggle
  enable_npl_detection BOOLEAN DEFAULT true,
  npl_prompt_override TEXT, -- Custom NLP detection logic if needed
  
  -- Display Preferences
  dark_mode BOOLEAN DEFAULT true,
  timezone TEXT DEFAULT 'Europe/Madrid',
  
  -- Notification Settings
  notify_on_new_leads BOOLEAN DEFAULT true,
  notify_on_reply BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE user_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and update their own config"
  ON user_configuration FOR ALL USING (auth.uid() = user_id);


-- ========================================
-- INITIAL SYSTEM PROMPTS
-- ========================================

INSERT INTO system_prompts (prompt_key, prompt_type, prompt_content, language, version)
VALUES 
(
  'profile_analysis_immobiliarias',
  'system',
  'Eres un experto en prospección B2B especializado en el sector inmobiliario. Analiza el perfil de LinkedIn de un potencial cliente (dueño de inmobiliaria). 
  
Tu análisis debe ser CONCISO y enfocado en:
1. Confirmar si es DUEÑO/DECISOR de una inmobiliaria (no agente comercial)
2. Detectar si tiene potencial para NPLs (Créditos Problemáticos)
3. Generar 2 icebreakers cortos (<25 palabras cada uno):
   - Mensaje A: Enfocado en AUTOMATIZACIÓN de atención al cliente
   - Mensaje B: Enfocado en NPLs (si aplica)

Responde SOLO con JSON válido.',
  'es',
  1
),
(
  'message_generation_generic',
  'user',
  'Cliente: {client_name}
Empresa: {company_name}
Cargo: {job_title}
Ubicación: {location}

Genera 2 mensajes cortos (<30 palabras) y directos para LinkedIn:
- Mensaje A: Propuesta de automatización de atención al cliente
- Mensaje B: Propuesta sobre NPLs (solo si tiene potencial)

Formato JSON: {"messageA": "...", "messageB": "..."}',
  'es',
  1
),
(
  'npl_detection',
  'system',
  'Analiza el perfil de LinkedIn para detectar señales de interés en NPLs (Créditos Problemáticos):
- Volumen de cartera de inversión inmobiliaria
- Experiencia en restructuraciones
- Mentalidad hacia activos alternativos
- Tamaño de empresa (probabilidad de NPL)

Responde: {"npl_potential": true/false, "confidence": 0-1, "reason": "..."}',
  'es',
  1
);


-- ========================================
-- COMMENTS & DOCUMENTATION
-- ========================================

COMMENT ON TABLE leads IS 'Principal tabla de prospectos/leads. Cada registro es una persona de LinkedIn que se ha identificado como potencial cliente.';
COMMENT ON TABLE message_templates IS 'Almacena los 2 mensajes generados por IA para cada lead. Se utiliza para que Marcos revise y copie antes de enviar.';
COMMENT ON TABLE search_criteria IS 'Define los filtros de búsqueda permanentes (p.ej., "Inmobiliarias España"). Permite guardar y reutilizar criterios.';
COMMENT ON TABLE daily_contact_log IS 'Registro diario de los contactos que Marcos realiza (máx 25/día). Ayuda a trackear su progreso hacia los 57.000.';

