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
    totalCount: number;
  }> {
    const existingWebsites = new Set<string>();
    const existingCompanyNames = new Set<string>();

    if (!userId) {
      console.warn('[DEDUP] No userId provided. Skipping duplicate check.');
      return { existingWebsites, existingCompanyNames, totalCount: 0 };
    }

    try {
      // Fetch all leads from user's history (NEW SCHEMA: table 'leads')
      const { data, error } = await supabase
        .from('leads')
        .select('company_name, company_website, linkedin_url')
        .eq('user_id', userId);

      if (error) {
        console.error('[DEDUP] Error fetching existing leads:', error);
        return { existingWebsites, existingCompanyNames, totalCount: 0 };
      }

      if (!data || data.length === 0) {
        console.log('[DEDUP] ✅ Pre-Flight: Usuario sin historial previo');
        return { existingWebsites, existingCompanyNames, totalCount: 0 };
      }

      // Extract and normalize all previously scraped leads
      for (const row of data) {
        // Add normalized website
        if (row.company_website) {
          const normalizedUrl = this.normalizeUrl(row.company_website);
          existingWebsites.add(normalizedUrl);
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
      }

      const totalCount = existingWebsites.size + existingCompanyNames.size;
      console.log(
        `[DEDUP] ✅ Pre-Flight Complete: ${existingWebsites.size} dominios + ${existingCompanyNames.size} empresas descargadas`
      );

      return { existingWebsites, existingCompanyNames, totalCount };
    } catch (error) {
      console.error('[DEDUP] Unexpected error in fetchExistingLeads:', error);
      return { existingWebsites, existingCompanyNames, totalCount: 0 };
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
   * @returns Array filtrado solo con leads únicos
   */
  filterUniqueCandidates(
    candidates: Lead[],
    existingWebsites: Set<string>,
    existingCompanyNames: Set<string>
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
