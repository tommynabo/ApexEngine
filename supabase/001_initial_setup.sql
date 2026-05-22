-- ============================================================
-- APEX ENGINE — 001_initial_setup.sql
-- Migración inicial completa para proyecto Supabase nuevo
-- ICP: Agencias de Marketing y Comunidades de Skool
-- Versión: 1.0.0
-- ============================================================
-- INSTRUCCIONES: Pegar completo en Supabase Dashboard > SQL Editor > Run
-- Es idempotente: se puede ejecutar varias veces sin error
-- ============================================================


-- ============================================================
-- PASO 1: EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- gen_random_uuid() support legacy
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- índices GIN para búsqueda de texto


-- ============================================================
-- PASO 2: FUNCIÓN GLOBAL updated_at
-- Reutilizada por todos los triggers de actualización
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ============================================================
-- TABLA 1: profiles
-- 1 fila por usuario. Se crea automáticamente en el signup.
-- Linked directamente a auth.users (no tiene user_id, su PK es el id del user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  full_name     TEXT,
  company_name  TEXT,
  target_icp    TEXT,                     -- Descripción libre del ICP del cliente
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- TABLA 2: search_history
-- Cada ejecución de búsqueda = 1 fila. Equivale a SearchSession en types.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.search_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query            TEXT NOT NULL,
  source           TEXT NOT NULL CHECK (source IN ('gmail', 'linkedin', 'instagram')),
  mode             TEXT NOT NULL DEFAULT 'fast' CHECK (mode IN ('fast', 'deep')),
  max_results      INTEGER DEFAULT 10,
  results_count    INTEGER DEFAULT 0,
  icp_type         TEXT CHECK (icp_type IN ('agency', 'skool_creator', 'other')),
  advanced_filters JSONB,                 -- AdvancedFilter: { locations, jobTitles, companySizes, industries, keywords }
  executed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_search_history_updated_at ON public.search_history;
CREATE TRIGGER trg_search_history_updated_at
  BEFORE UPDATE ON public.search_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- TABLA 3: leads
-- ENTIDAD CENTRAL. Refleja exactamente la interfaz Lead de lib/types.ts
-- Incluye todos los campos ICP: social_links, community_size, tech_stack, icp_type
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_id         UUID REFERENCES public.search_history(id) ON DELETE SET NULL,

  -- === Campos base (Lead interface) ===
  source            TEXT NOT NULL CHECK (source IN ('gmail', 'linkedin', 'instagram')),
  company_name      TEXT NOT NULL,
  website           TEXT,
  social_url        TEXT,
  location          TEXT,

  -- === Datos complejos estructurados (JSONB) ===
  -- decision_maker: { name, role, email, phone?, linkedin?, facebook?, instagram? }
  decision_maker    JSONB,
  -- ai_analysis: { summary, painPoints[], generatedIcebreaker, fullMessage,
  --               fullAnalysis, psychologicalProfile, businessMoment, salesAngle }
  ai_analysis       JSONB,

  -- === Mensajes generados ===
  message_a         TEXT,                 -- Mensaje variante A (automation-focused)
  is_npl_potential  BOOLEAN DEFAULT FALSE,

  -- === Estado del pipeline ===
  status            TEXT NOT NULL DEFAULT 'scraped'
                    CHECK (status IN ('scraped', 'enriched', 'ready', 'contacted', 'replied', 'discarded')),

  -- === Campos ICP-específicos (Agencias y Comunidades Skool) ===
  social_links      JSONB,               -- Record<string, string> ej: { "twitter": "...", "facebook": "..." }
  community_size    INTEGER,             -- Número de miembros (ej: comunidad Skool)
  tech_stack        TEXT[],              -- Tecnologías identificadas ej: ["Kajabi", "ActiveCampaign"]
  icp_type          TEXT CHECK (icp_type IN ('agency', 'skool_creator', 'other')),

  -- === Auditoría ===
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- TABLA 4: search_criteria
-- Criterios de búsqueda guardados/reutilizables. Equivale a SearchConfigState
-- ============================================================
CREATE TABLE IF NOT EXISTS public.search_criteria (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  query            TEXT,
  source           TEXT CHECK (source IN ('gmail', 'linkedin', 'instagram')),
  mode             TEXT DEFAULT 'fast' CHECK (mode IN ('fast', 'deep')),
  max_results      INTEGER DEFAULT 10,
  advanced_filters JSONB,               -- AdvancedFilter completo
  icp_type         TEXT CHECK (icp_type IN ('agency', 'skool_creator', 'other')),
  is_default       BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.search_criteria ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_search_criteria_updated_at ON public.search_criteria;
CREATE TRIGGER trg_search_criteria_updated_at
  BEFORE UPDATE ON public.search_criteria
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- TABLA 5: message_templates
-- Plantillas de outreach personalizadas por plataforma e ICP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL,
  platform    TEXT CHECK (platform IN ('gmail', 'linkedin', 'instagram')),
  icp_type    TEXT CHECK (icp_type IN ('agency', 'skool_creator', 'other')),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_message_templates_updated_at ON public.message_templates;
CREATE TRIGGER trg_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- TABLA 6: daily_contact_log
-- Controla el límite diario de contactos (env: VITE_DAILY_CONTACT_LIMIT=25)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_contact_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id      UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  platform     TEXT CHECK (platform IN ('gmail', 'linkedin', 'instagram')),
  contacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.daily_contact_log ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLA 7: user_configuration
-- Configuración de la app por usuario. 1 fila por user (UNIQUE).
-- Se crea automáticamente al hacer signup via trigger.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_configuration (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_contact_limit   INTEGER DEFAULT 25,
  enable_npl_detection  BOOLEAN DEFAULT TRUE,
  enable_msg_variants   BOOLEAN DEFAULT TRUE,
  batch_strategy        TEXT DEFAULT 'provincial'
                        CHECK (batch_strategy IN ('provincial', 'alphabetical', 'random')),
  target_industries     TEXT[] DEFAULT '{}',
  required_titles       TEXT[] DEFAULT '{}',
  exclude_titles        TEXT[] DEFAULT '{}',
  icp_type              TEXT CHECK (icp_type IN ('agency', 'skool_creator', 'other')),
  apex_engine_config    JSONB,           -- ApexEngineConfig serializado completo
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_configuration ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_user_configuration_updated_at ON public.user_configuration;
CREATE TRIGGER trg_user_configuration_updated_at
  BEFORE UPDATE ON public.user_configuration
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- TABLA 8: api_usage_tracking
-- Rastrea consumo y costos de APIs externas (OpenAI, Apify)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_usage_tracking (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_name    TEXT NOT NULL,             -- 'openai' | 'apify'
  operation   TEXT,                      -- 'analyze_lead' | 'scrape_instagram' | etc.
  tokens_used INTEGER DEFAULT 0,
  cost_usd    NUMERIC(10, 6) DEFAULT 0,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_usage_tracking ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLA 9: deduplication_log
-- Registro del servicio DeduplicationService.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deduplication_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  duplicate_url    TEXT,
  duplicate_domain TEXT,
  detection_method TEXT,                 -- 'url' | 'domain' | 'phone' | 'email'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.deduplication_log ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLA 10: system_prompts
-- Prompts del sistema para la IA. Sin user_id — lectura pública.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_prompts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  content    TEXT NOT NULL,
  version    INTEGER DEFAULT 1,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_system_prompts_updated_at ON public.system_prompts;
CREATE TRIGGER trg_system_prompts_updated_at
  BEFORE UPDATE ON public.system_prompts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- PASO 5: FUNCIONES Y TRIGGERS DE AUTH
-- ============================================================

-- Función: crear profile automáticamente al registrar un usuario nuevo
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE
    SET email      = EXCLUDED.email,
        updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Función: crear configuración por defecto al crear el profile
CREATE OR REPLACE FUNCTION public.create_default_config()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_configuration (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_default_config();


-- ============================================================
-- PASO 4: POLÍTICAS RLS — ROW LEVEL SECURITY
-- Regla universal: un usuario SOLO puede ver/modificar SUS propios datos
-- auth.uid() = user_id  (o  auth.uid() = id  para profiles)
-- ============================================================

-- ----------------------------------------------------------------
-- profiles  (PK = auth.users.id, no tiene columna user_id separada)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_own"   ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete_own" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

-- ----------------------------------------------------------------
-- search_history
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "search_history_select_own" ON public.search_history;
DROP POLICY IF EXISTS "search_history_insert_own" ON public.search_history;
DROP POLICY IF EXISTS "search_history_update_own" ON public.search_history;
DROP POLICY IF EXISTS "search_history_delete_own" ON public.search_history;

CREATE POLICY "search_history_select_own" ON public.search_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "search_history_insert_own" ON public.search_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "search_history_update_own" ON public.search_history
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "search_history_delete_own" ON public.search_history
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- leads  ← CRÍTICO: filtra por user_id en todas las operaciones
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "leads_select_own" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_own" ON public.leads;
DROP POLICY IF EXISTS "leads_update_own" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_own" ON public.leads;

CREATE POLICY "leads_select_own" ON public.leads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "leads_insert_own" ON public.leads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "leads_update_own" ON public.leads
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "leads_delete_own" ON public.leads
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- search_criteria
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "search_criteria_select_own" ON public.search_criteria;
DROP POLICY IF EXISTS "search_criteria_insert_own" ON public.search_criteria;
DROP POLICY IF EXISTS "search_criteria_update_own" ON public.search_criteria;
DROP POLICY IF EXISTS "search_criteria_delete_own" ON public.search_criteria;

CREATE POLICY "search_criteria_select_own" ON public.search_criteria
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "search_criteria_insert_own" ON public.search_criteria
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "search_criteria_update_own" ON public.search_criteria
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "search_criteria_delete_own" ON public.search_criteria
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- message_templates
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "message_templates_select_own" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_insert_own" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_update_own" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_delete_own" ON public.message_templates;

CREATE POLICY "message_templates_select_own" ON public.message_templates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "message_templates_insert_own" ON public.message_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "message_templates_update_own" ON public.message_templates
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "message_templates_delete_own" ON public.message_templates
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- daily_contact_log
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "daily_contact_log_select_own" ON public.daily_contact_log;
DROP POLICY IF EXISTS "daily_contact_log_insert_own" ON public.daily_contact_log;
DROP POLICY IF EXISTS "daily_contact_log_update_own" ON public.daily_contact_log;
DROP POLICY IF EXISTS "daily_contact_log_delete_own" ON public.daily_contact_log;

CREATE POLICY "daily_contact_log_select_own" ON public.daily_contact_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "daily_contact_log_insert_own" ON public.daily_contact_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "daily_contact_log_update_own" ON public.daily_contact_log
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "daily_contact_log_delete_own" ON public.daily_contact_log
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- user_configuration
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "user_configuration_select_own" ON public.user_configuration;
DROP POLICY IF EXISTS "user_configuration_insert_own" ON public.user_configuration;
DROP POLICY IF EXISTS "user_configuration_update_own" ON public.user_configuration;
DROP POLICY IF EXISTS "user_configuration_delete_own" ON public.user_configuration;

CREATE POLICY "user_configuration_select_own" ON public.user_configuration
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_configuration_insert_own" ON public.user_configuration
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_configuration_update_own" ON public.user_configuration
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_configuration_delete_own" ON public.user_configuration
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- api_usage_tracking
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "api_usage_tracking_select_own" ON public.api_usage_tracking;
DROP POLICY IF EXISTS "api_usage_tracking_insert_own" ON public.api_usage_tracking;
DROP POLICY IF EXISTS "api_usage_tracking_update_own" ON public.api_usage_tracking;
DROP POLICY IF EXISTS "api_usage_tracking_delete_own" ON public.api_usage_tracking;

CREATE POLICY "api_usage_tracking_select_own" ON public.api_usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "api_usage_tracking_insert_own" ON public.api_usage_tracking
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "api_usage_tracking_update_own" ON public.api_usage_tracking
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "api_usage_tracking_delete_own" ON public.api_usage_tracking
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- deduplication_log
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "deduplication_log_select_own" ON public.deduplication_log;
DROP POLICY IF EXISTS "deduplication_log_insert_own" ON public.deduplication_log;
DROP POLICY IF EXISTS "deduplication_log_delete_own" ON public.deduplication_log;

CREATE POLICY "deduplication_log_select_own" ON public.deduplication_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "deduplication_log_insert_own" ON public.deduplication_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "deduplication_log_delete_own" ON public.deduplication_log
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- system_prompts — lectura pública para todos (sin autenticación)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "system_prompts_public_read" ON public.system_prompts;

CREATE POLICY "system_prompts_public_read" ON public.system_prompts
  FOR SELECT USING (TRUE);


-- ============================================================
-- PASO 6: ÍNDICES DE RENDIMIENTO
-- ============================================================

-- leads (tabla más consultada)
CREATE INDEX IF NOT EXISTS idx_leads_user_id      ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_search_id    ON public.leads(search_id);
CREATE INDEX IF NOT EXISTS idx_leads_status       ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_icp_type     ON public.leads(icp_type);
CREATE INDEX IF NOT EXISTS idx_leads_created_at   ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_source       ON public.leads(source);
-- Búsqueda full-text por nombre de empresa
CREATE INDEX IF NOT EXISTS idx_leads_company_fts  ON public.leads
  USING gin(to_tsvector('spanish', coalesce(company_name, '')));
-- Búsqueda en tech_stack (array)
CREATE INDEX IF NOT EXISTS idx_leads_tech_stack   ON public.leads USING gin(tech_stack);

-- search_history
CREATE INDEX IF NOT EXISTS idx_search_history_user ON public.search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_date ON public.search_history(executed_at DESC);

-- search_criteria
CREATE INDEX IF NOT EXISTS idx_search_criteria_user ON public.search_criteria(user_id);

-- daily_contact_log (consultas frecuentes por fecha para límites diarios)
CREATE INDEX IF NOT EXISTS idx_daily_contact_user_date
  ON public.daily_contact_log(user_id, contacted_at DESC);

-- api_usage_tracking
CREATE INDEX IF NOT EXISTS idx_api_usage_user     ON public.api_usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_api_name ON public.api_usage_tracking(api_name);

-- deduplication_log
CREATE INDEX IF NOT EXISTS idx_dedup_user_id      ON public.deduplication_log(user_id);
CREATE INDEX IF NOT EXISTS idx_dedup_domain       ON public.deduplication_log(duplicate_domain);


-- ============================================================
-- PASO 7: COMENTARIOS PARA DOCUMENTACIÓN
-- ============================================================
COMMENT ON TABLE public.profiles           IS 'Perfil de cada usuario. 1:1 con auth.users. Se crea automáticamente en el signup.';
COMMENT ON TABLE public.leads              IS 'Entidad principal del sistema. Refleja Lead en lib/types.ts. ICP: agencias y skool creators.';
COMMENT ON TABLE public.search_history     IS 'Historial de búsquedas / campañas ejecutadas. Equivale a SearchSession en types.ts.';
COMMENT ON TABLE public.search_criteria    IS 'Criterios de búsqueda guardados y reutilizables por el usuario.';
COMMENT ON TABLE public.message_templates  IS 'Plantillas de mensajes de outreach personalizadas por plataforma e ICP.';
COMMENT ON TABLE public.daily_contact_log  IS 'Log de contactos diarios para respetar el límite configurado (default: 25/día).';
COMMENT ON TABLE public.user_configuration IS 'Configuración de la aplicación por usuario. 1 fila por user. Se crea automáticamente.';
COMMENT ON TABLE public.api_usage_tracking IS 'Rastreo de uso y costos de APIs externas (OpenAI, Apify).';
COMMENT ON TABLE public.deduplication_log  IS 'Registro de leads duplicados detectados por DeduplicationService.ts.';
COMMENT ON TABLE public.system_prompts     IS 'Prompts del sistema para la IA. Lectura pública (sin autenticación requerida).';

COMMENT ON COLUMN public.leads.decision_maker   IS 'JSONB: { name, role, email, phone?, linkedin?, facebook?, instagram? }';
COMMENT ON COLUMN public.leads.ai_analysis      IS 'JSONB: { summary, painPoints[], generatedIcebreaker, fullMessage, fullAnalysis, psychologicalProfile, businessMoment, salesAngle }';
COMMENT ON COLUMN public.leads.social_links     IS 'JSONB ICP: Record<string,string> ej: { twitter:"...", tiktok:"..." }';
COMMENT ON COLUMN public.leads.community_size   IS 'ICP Skool: número de miembros de la comunidad';
COMMENT ON COLUMN public.leads.tech_stack       IS 'ICP: tecnologías detectadas ej: ["Kajabi", "ActiveCampaign", "Zapier"]';
COMMENT ON COLUMN public.leads.icp_type         IS 'Segmentación ICP: agency | skool_creator | other';


-- ============================================================
-- PASO 8: BACKFILL (por si ya hay usuarios en auth.users)
-- ============================================================

-- Crear profiles para usuarios existentes que no tengan uno
INSERT INTO public.profiles (id, email, full_name)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Crear configuración por defecto para perfiles sin configuración
INSERT INTO public.user_configuration (user_id)
SELECT id FROM public.profiles
WHERE id NOT IN (SELECT user_id FROM public.user_configuration)
ON CONFLICT (user_id) DO NOTHING;


-- ============================================================
-- ✅ SETUP COMPLETO
-- ============================================================
-- Tablas creadas (10):
--   profiles, search_history, leads, search_criteria,
--   message_templates, daily_contact_log, user_configuration,
--   api_usage_tracking, deduplication_log, system_prompts
--
-- Seguridad:
--   • RLS habilitado en las 10 tablas
--   • 4 políticas por tabla (SELECT/INSERT/UPDATE/DELETE)
--   • system_prompts: política de lectura pública
--
-- Automatizaciones:
--   • Trigger: on_auth_user_created → crea profile automáticamente
--   • Trigger: on_profile_created   → crea user_configuration por defecto
--   • Triggers updated_at en todas las tablas relevantes
--
-- Índices: 16 índices de rendimiento incluyendo GIN full-text y arrays
-- ============================================================
