-- ========================================
-- APEX ENGINE - ICP Fields Migration
-- Adds ICP-specific columns to the leads table
-- Run once in Supabase SQL Editor
-- ========================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS social_links   JSONB,
  ADD COLUMN IF NOT EXISTS community_size INTEGER,
  ADD COLUMN IF NOT EXISTS tech_stack     TEXT[],
  ADD COLUMN IF NOT EXISTS icp_type       TEXT CHECK (icp_type IN ('agency', 'skool_creator', 'other'));

-- Index for fast ICP-type filtering
CREATE INDEX IF NOT EXISTS idx_leads_icp_type ON leads(icp_type);

-- ========================================
-- MIGRATION COMPLETE
-- ========================================
-- social_links   : JSONB  — e.g. {"instagram": "https://...", "linkedin": "https://...", "skool": "https://..."}
-- community_size : INTEGER — number of members (for Skool communities)
-- tech_stack     : TEXT[]  — tools/platforms detected (e.g. ["Skool", "Kajabi", "ClickFunnels"])
-- icp_type       : TEXT    — 'agency' | 'skool_creator' | 'other'
