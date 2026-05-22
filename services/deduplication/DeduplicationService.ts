import { Lead } from '../../lib/types';
import { supabase } from '../../lib/supabase';

/**
 * DeduplicationService
 * Implementa la lógica Anti-Duplicados para sistemas de prospección
 * 
 * REGLA DE ORO:
 * "Un lead nunca debe ser procesado ni entregado si ya existe en la base de datos
 * histórica del usuario, independientemente de la búsqueda actual"
 */
export class DeduplicationService {
  /**
   * Normaliza URLs para comparación
   * Convierte a minúsculas, elimina https://, www., y trailing slashes
   * @param url - URL a normalizar
   * @returns URL normalizada
   */
  private normalizeUrl(url: string): string {
    if (!url) return '';
    return url
      .toLowerCase()
      .replace(/^https?:\/\//i, '') // Remove protocol
      .replace(/^www\./, '') // Remove www
      .replace(/\/$/, '') // Remove trailing slash
      .trim();
  }

  /**
   * Normaliza URLs de LinkedIn para comparación robusta.
   * Maneja caracteres URL-encoded (ej: %C3%A9 → é) y sufijos de idioma (/es, /en).
   */
  private normalizeLinkedinUrl(url: string): string {
    if (!url) return '';
    try {
      const decoded = decodeURIComponent(url);
      return decoded
        .toLowerCase()
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./, '')
        .replace(/\/(en|es|fr|de|pt|it|nl)(\/?$|\?).*/, '') // strip locale suffix
        .replace(/\/$/, '')
        .trim();
    } catch {
      return url
        .toLowerCase()
        .replace(/^https?:\/\//i, '')
        .replace(/\/$/, '')
        .trim();
    }
  }

  /**
   * Normaliza nombres de empresas para comparación
   * Convierte a minúsculas y elimina espacios extras
   * @param name - Nombre a normalizar
   * @returns Nombre normalizado
   */
  private normalizeName(name: string): string {
    if (!name) return '';
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' '); // Normalize spaces
  }

  /**
   * FASE 1: Pre-Flight
   * Descarga todos los dominios y nombres de empresas del usuario desde Supabase
   * Los guarda en Sets para búsqueda rápida en memoria
   * 
   * @param userId - ID del usuario
   * @returns Objeto con Sets de dominios y nombres existentes
   */
  async fetchExistingLeads(userId: string | null): Promise<{
    existingWebsites: Set<string>;
    existingCompanyNames: Set<string>;
    existingEmails: Set<string>;
    existingLinkedinUrls: Set<string>;
    totalCount: number;
  }> {
    const existingWebsites = new Set<string>();
    const existingCompanyNames = new Set<string>();
    const existingEmails = new Set<string>();
    const existingLinkedinUrls = new Set<string>();

    if (!userId) {
      console.warn('[DEDUP] No userId provided. Skipping duplicate check.');
      return { existingWebsites, existingCompanyNames, existingEmails, existingLinkedinUrls, totalCount: 0 };
    }

    try {
      // Fetch all leads from user's history (NEW SCHEMA: table 'leads')
      // LinkedIn URL and email are stored inside decision_maker JSONB, not as flat columns
      const { data, error } = await supabase
        .from('leads')
        .select('company_name, website, decision_maker')
        .eq('user_id', userId);

      if (error) {
        console.error('[DEDUP] Error fetching existing leads:', error);
        return { existingWebsites, existingCompanyNames, existingEmails, existingLinkedinUrls, totalCount: 0 };
      }

      if (!data || data.length === 0) {
        console.log('[DEDUP] ✅ Pre-Flight: Usuario sin historial previo');
        return { existingWebsites, existingCompanyNames, existingEmails, existingLinkedinUrls, totalCount: 0 };
      }

      // Extract and normalize all previously scraped leads
      for (const row of data) {
        // Fix: schema uses 'website', not 'company_website'
        if (row.website) {
          existingWebsites.add(this.normalizeUrl(row.website));
        }

        // Add normalized company name
        if (row.company_name) {
          const normalizedName = this.normalizeName(row.company_name);
          if (
            row.company_name !== 'Sin Nombre' &&
            row.company_name !== 'Empresa Desconocida' &&
            !normalizedName.includes('sin nombre') &&
            !normalizedName.includes('empresa desconocida')
          ) {
            existingCompanyNames.add(normalizedName);
          }
        }

        // Fix: email and linkedin are inside decision_maker JSONB, not flat columns.
        // These checks must be OUTSIDE the company_name block so person-level dedup
        // works even when company name is empty or generic.
        const dm = row.decision_maker as { linkedin?: string; email?: string } | null;
        if (dm?.email) {
          existingEmails.add(dm.email.toLowerCase().trim());
        }
        if (dm?.linkedin) {
          existingLinkedinUrls.add(this.normalizeLinkedinUrl(dm.linkedin));
        }
      }

      // We allow multiple "Empresa Desconocida" leads because they might be different people
      const totalCount = existingWebsites.size + existingCompanyNames.size + existingEmails.size + existingLinkedinUrls.size;
      console.log(
        `[DEDUP] ✅ Pre-Flight Complete: ${existingWebsites.size} dominios + ${existingCompanyNames.size} empresas descargadas`
      );

      return { existingWebsites, existingCompanyNames, existingEmails, existingLinkedinUrls, totalCount };
    } catch (error) {
      console.error('[DEDUP] Unexpected error in fetchExistingLeads:', error);
      return { existingWebsites, existingCompanyNames, existingEmails, existingLinkedinUrls, totalCount: 0 };
    }
  }

  /**
   * FASE 2: Filtrado (In-Loop)
   * Compara cada candidato contra los Sets de leads existentes
   * Descarta cualquier lead que ya existe
   * 
   * @param candidates - Array de leads candidatos
   * @param existingWebsites - Set de dominios ya conocidos
   * @param existingCompanyNames - Set de nombres de empresas ya conocidas
   * @param existingEmails - Set de emails ya conocidos
   * @param existingLinkedinUrls - Set de URLs de linkedin ya conocidos
   * @returns Array filtrado solo con leads únicos
   */
  filterUniqueCandidates(
    candidates: Lead[],
    existingWebsites: Set<string>,
    existingCompanyNames: Set<string>,
    existingEmails: Set<string> = new Set(),
    existingLinkedinUrls: Set<string> = new Set()
  ): Lead[] {
    const uniqueCandidates: Lead[] = [];
    const duplicateLog: string[] = [];

    for (const candidate of candidates) {
      let isDuplicate = false;
      let duplicateReason = '';

      // Check website
      if (candidate.website) {
        const normalizedUrl = this.normalizeUrl(candidate.website);
        if (existingWebsites.has(normalizedUrl)) {
          isDuplicate = true;
          duplicateReason = `website: ${candidate.website}`;
        }
      }

      // Check linkedin url (use normalizeLinkedinUrl to handle URL-encoding and locale suffixes)
      if (!isDuplicate && candidate.decisionMaker?.linkedin) {
        const urlToMatch = this.normalizeLinkedinUrl(candidate.decisionMaker.linkedin);
        if (existingLinkedinUrls.has(urlToMatch)) {
          isDuplicate = true;
          duplicateReason = `linkedin: ${urlToMatch}`;
        }
      }

      // Check email
      if (!isDuplicate && candidate.decisionMaker?.email) {
        const emailToMatch = candidate.decisionMaker.email.toLowerCase().trim();
        if (existingEmails.has(emailToMatch)) {
          isDuplicate = true;
          duplicateReason = `email: ${emailToMatch}`;
        }
      }

      // Check company name (only if not already marked as duplicate)
      if (!isDuplicate && candidate.companyName) {
        const normalizedName = this.normalizeName(candidate.companyName);

        // Skip check if the candidate itself has a generic name
        // We allow multiple "Empresa Desconocida" leads because they might be different people
        const isGeneric =
          candidate.companyName === 'Sin Nombre' ||
          candidate.companyName === 'Empresa Desconocida' ||
          normalizedName.includes('sin nombre') ||
          normalizedName.includes('empresa desconocida');

        if (!isGeneric && existingCompanyNames.has(normalizedName)) {
          isDuplicate = true;
          duplicateReason = `company: ${candidate.companyName}`;
        }
      }

      if (isDuplicate) {
        duplicateLog.push(`❌ DESCARTADO: ${candidate.companyName || 'Unknown'} (${duplicateReason})`);
      } else {
        uniqueCandidates.push(candidate);
      }
    }

    // Log results
    if (duplicateLog.length > 0) {
      console.log(`[DEDUP] 🎯 Fase de Filtrado: ${duplicateLog.length} duplicados descartados`);
      duplicateLog.forEach(log => console.log(`[DEDUP] ${log}`));
    }

    console.log(
      `[DEDUP] ✅ Resultado: ${uniqueCandidates.length}/${candidates.length} leads únicos (${candidates.length - uniqueCandidates.length} rechazados)`
    );

    return uniqueCandidates;
  }

  /**
   * PHASE 3: Logging
   * Registers duplicate findings in the deduplication_log table
   * 
   * @param duplicates - Array of duplicate records found
   * @param userId - User ID for the log entry
   * @param sessionId - Search session ID
   * @returns boolean indicating success
   */
  async logDuplications(
    duplicates: Array<{ name: string; reason: string }>,
    userId: string | null,
    sessionId: string
  ): Promise<boolean> {
    if (!userId || duplicates.length === 0) {
      return true; // Skip if no duplicates
    }

    try {
      const logEntries = duplicates.map(dup => ({
        user_id: userId,
        search_id: sessionId,
        duplicate_name: dup.name,
        duplicate_reason: dup.reason,
        detected_at: new Date().toISOString()
      }));

      const { error } = await supabase.from('deduplication_log').insert(logEntries);

      if (error) {
        console.warn('[DEDUP] Warning logging duplicates:', error.message);
        return false;
      }

      console.log(`[DEDUP] 📝 Registered ${duplicates.length} duplicates in log`);
      return true;
    } catch (error) {
      console.warn('[DEDUP] Unexpected error logging duplicates:', error);
      return false;
    }
  }

  /**
   * FASE 3: Guardado
   * Solo guarda en la base de datos los leads que pasaron el filtro de deduplicación
   * Este método es llamado desde App.tsx después de obtener los resultados
   * 
   * @param leads - Leads ya deduplicados
   * @param userId - ID del usuario propietario
   * @param sessionId - ID de la sesión de búsqueda
   * @returns boolean indicando éxito o fallo
   */
  async saveUniqueLeads(leads: Lead[], userId: string | null, sessionId: string): Promise<boolean> {
    if (!userId || leads.length === 0) {
      console.warn('[DEDUP] No leads to save or missing userId');
      return false;
    }

    try {
      // Save each lead individually to the 'leads' table (new schema)
      const leadsToInsert = leads.map(lead => ({
        user_id: userId,
        search_id: sessionId,
        name: lead.decisionMaker?.name || lead.companyName || '',
        company_name: lead.companyName || '',
        job_title: lead.decisionMaker?.role || '',
        linkedin_url: lead.decisionMaker?.linkedin || '',
        email: lead.decisionMaker?.email || '',
        phone: lead.decisionMaker?.phone || '',
        company_website: lead.website || '',
        location: lead.location || '',
        ai_summary: lead.aiAnalysis?.summary || '',
        ai_pain_points: lead.aiAnalysis?.painPoints || [],
        ai_business_moment: lead.aiAnalysis?.businessMoment || '',
        ai_is_npl_potential: lead.isNPLPotential || false,
        status: lead.status || 'scraped'
      }));

      const { error } = await supabase.from('leads').insert(leadsToInsert);

      if (error) {
        console.error('[DEDUP] Error saving leads:', error);
        return false;
      }

      console.log(`[DEDUP] 💾 Guardado exitoso: ${leads.length} leads guardados en base de datos`);
      return true;
    } catch (error) {
      console.error('[DEDUP] Unexpected error in saveUniqueLeads:', error);
      return false;
    }
  }
}

// Export singleton instance
export const deduplicationService = new DeduplicationService();
