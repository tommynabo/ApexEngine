import { Lead, SearchConfigState } from '../../lib/types';

export type LogCallback = (message: string) => void;
export type ResultCallback = (leads: Lead[]) => void;

// Apify Actor IDs
const GOOGLE_MAPS_SCRAPER = 'nwua9Gu5YrADL7ZDj';
const CONTACT_SCRAPER = 'vdrmO1lXCkhbPjE9j';
const DECISION_MAKER_FINDER = 'curious_coder/decision-maker-email-extractor';
const GOOGLE_SEARCH_SCRAPER = 'apify/google-search-scraper'; // For LinkedIn profile search via Google

export class SearchService {
    private isRunning = false;
    private apiKey: string = '';
    private openaiKey: string = '';

    public stop() {
        this.isRunning = false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SMART QUERY INTERPRETER - Uses AI to optimize search terms
    // ═══════════════════════════════════════════════════════════════════════════
    private async interpretQuery(userQuery: string, platform: 'gmail' | 'linkedin'): Promise<{
        searchQuery: string;
        industry: string;
        targetRoles: string[];
        location: string;
    }> {
        if (!this.openaiKey) {
            return {
                searchQuery: userQuery,
                industry: userQuery,
                targetRoles: ['CEO', 'Fundador', 'Propietario', 'Director General'],
                location: 'España'
            };
        }

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openaiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `Eres un experto en prospección B2B. El usuario quiere encontrar leads de negocios.
Tu trabajo es interpretar su búsqueda y generar los mejores términos para encontrar DUEÑOS y DECISORES de empresas.

Responde SOLO con JSON válido en este formato exacto:
{
  "searchQuery": "término optimizado para buscar en ${platform === 'linkedin' ? 'LinkedIn' : 'Google Maps'}",
  "industry": "sector/industria detectada",
  "targetRoles": ["array de cargos a buscar en español e inglés"],
  "location": "ubicación geográfica o España por defecto"
}`
                        },
                        {
                            role: 'user',
                            content: `Interpreta esta búsqueda para encontrar leads: "${userQuery}"`
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 200
                })
            });

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';

            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.error('Error interpreting query:', e);
        }

        return {
            searchQuery: userQuery,
            industry: userQuery,
            targetRoles: ['CEO', 'Founder', 'Owner', 'Propietario', 'Director'],
            location: 'España'
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AI LEAD ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════
    private async generateLeadAnalysis(lead: Lead): Promise<string> {
        if (!this.openaiKey) {
            return `${lead.companyName}: ${lead.aiAnalysis?.summary || 'Sin análisis disponible'}`;
        }

        try {
            const context = `
Empresa: ${lead.companyName}
Ubicación: ${lead.location || 'No especificada'}
Web: ${lead.website || 'No disponible'}
Decisor: ${lead.decisionMaker?.name || 'No identificado'} - ${lead.decisionMaker?.role || 'Cargo desconocido'}
LinkedIn: ${lead.decisionMaker?.linkedin || 'No disponible'}
Email: ${lead.decisionMaker?.email || 'No disponible'}
Resumen previo: ${lead.aiAnalysis?.summary || ''}
            `.trim();

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openaiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `Eres un analista de prospección B2B experto. Genera un ANÁLISIS COMPLETO del lead para ventas.

El análisis debe incluir:
1. RESUMEN: Quién es esta empresa/persona en 2 frases
2. OPORTUNIDAD: Por qué podría ser un buen cliente potencial
3. PAIN POINTS: 2-3 problemas que probablemente tenga este tipo de negocio
4. CUELLO DE BOTELLA: El principal obstáculo que enfrenta
5. ÁNGULO DE ENTRADA: Cómo iniciar la conversación

Sé conciso pero completo. Máximo 150 palabras total.`
                        },
                        {
                            role: 'user',
                            content: `Analiza este lead:\n${context}`
                        }
                    ],
                    temperature: 0.5,
                    max_tokens: 300
                })
            });

            const data = await response.json();
            return data.choices?.[0]?.message?.content || lead.aiAnalysis?.summary || '';
        } catch (e) {
            console.error('Error generating analysis:', e);
            return lead.aiAnalysis?.summary || '';
        }
    }

    private async callApifyActor(actorId: string, input: any, onLog: LogCallback): Promise<any[]> {
        const startUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${this.apiKey}`;

        onLog(`[APIFY] Iniciando actor: ${actorId}`);

        const startResponse = await fetch(startUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
        });

        if (!startResponse.ok) {
            const err = await startResponse.text();
            throw new Error(`Error iniciando actor ${actorId}: ${err}`);
        }

        const startData = await startResponse.json();
        const runId = startData.data.id;
        const defaultDatasetId = startData.data.defaultDatasetId;

        onLog(`[APIFY] Actor iniciado (Run: ${runId})`);

        let isFinished = false;
        let pollCount = 0;
        while (!isFinished && this.isRunning && pollCount < 60) {
            await new Promise(r => setTimeout(r, 5000));
            pollCount++;

            const statusUrl = `https://api.apify.com/v2/acts/${actorId}/runs/${runId}?token=${this.apiKey}`;
            const statusRes = await fetch(statusUrl);
            const statusData = await statusRes.json();
            const status = statusData.data.status;

            if (pollCount % 3 === 0) {
                onLog(`[APIFY] Estado: ${status}`);
            }

            if (status === 'SUCCEEDED') {
                isFinished = true;
            } else if (status === 'FAILED' || status === 'ABORTED') {
                throw new Error(`Actor falló: ${status}`);
            }
        }

        if (!this.isRunning) return [];

        const itemsUrl = `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${this.apiKey}`;
        const itemsRes = await fetch(itemsUrl);
        return await itemsRes.json();
    }

    public async startSearch(
        config: SearchConfigState,
        onLog: LogCallback,
        onComplete: ResultCallback
    ) {
        this.isRunning = true;

        try {
            this.apiKey = import.meta.env.VITE_APIFY_API_TOKEN || import.meta.env.VITE_APIFY_API_KEY || '';
            this.openaiKey = import.meta.env.VITE_OPENAI_API_KEY || '';

            if (!this.apiKey) {
                throw new Error("Falta la API Key de Apify. Configura VITE_APIFY_API_TOKEN en tu .env");
            }

            onLog(`[IA] 🧠 Interpretando búsqueda: "${config.query}"...`);
            const interpreted = await this.interpretQuery(config.query, config.source);
            onLog(`[IA] ✅ Industria: ${interpreted.industry}`);
            onLog(`[IA] ✅ Roles objetivo: ${interpreted.targetRoles.join(', ')}`);

            if (config.source === 'linkedin') {
                await this.searchLinkedIn(config, interpreted, onLog, onComplete);
            } else {
                await this.searchGmail(config, interpreted, onLog, onComplete);
            }

        } catch (error: any) {
            console.error(error);
            onLog(`[ERROR] ❌ Fallo crítico: ${error.message}`);
            onComplete([]);
        } finally {
            this.isRunning = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GMAIL SEARCH (Google Maps)
    // ═══════════════════════════════════════════════════════════════════════════
    private async searchGmail(
        config: SearchConfigState,
        interpreted: { searchQuery: string; industry: string; targetRoles: string[]; location: string },
        onLog: LogCallback,
        onComplete: ResultCallback
    ) {
        const query = `${interpreted.searchQuery} ${interpreted.location}`;
        onLog(`[GMAIL] 🗺️ Buscando: "${query}"`);

        const mapsInput = {
            searchStringsArray: [query],
            maxCrawledPlacesPerSearch: config.maxResults || 20,
            language: 'es',
            includeWebsiteEmail: true,
            scrapeContacts: true,
            maxImages: 0,
            maxReviews: 0,
        };

        const mapsResults = await this.callApifyActor(GOOGLE_MAPS_SCRAPER, mapsInput, onLog);
        onLog(`[GMAIL] ✅ ${mapsResults.length} empresas encontradas`);

        if (!this.isRunning) return;

        const basicLeads: Lead[] = mapsResults.map((item: any, index: number) => ({
            id: String(item.placeId || `lead-${Date.now()}-${index}`),
            source: 'gmail' as const,
            companyName: item.title || item.name || 'Sin Nombre',
            website: item.website?.replace(/^https?:\/\//, '').replace(/\/$/, ''),
            location: item.address || item.fullAddress,
            decisionMaker: {
                name: '',
                role: 'Propietario',
                email: item.email || (item.emails?.[0]) || '',
                phone: item.phone || (item.phones?.[0]) || '',
                linkedin: '',
                facebook: item.facebook || '',
                instagram: item.instagram || '',
            },
            aiAnalysis: {
                summary: `${item.categoryName || interpreted.industry} con ${item.reviewsCount || 0} reseñas (${item.totalScore || 'N/A'}⭐)`,
                painPoints: [],
                generatedIcebreaker: '',
                fullMessage: '',
                fullAnalysis: ''
            },
            status: item.email ? 'enriched' : 'scraped'
        }));

        // Enrich leads without email
        const leadsWithoutEmail = basicLeads.filter(l => !l.decisionMaker?.email && l.website);

        if (leadsWithoutEmail.length > 0 && this.isRunning) {
            onLog(`[GMAIL] 🔍 Enriqueciendo ${leadsWithoutEmail.length} leads...`);

            try {
                const contactResults = await this.callApifyActor(CONTACT_SCRAPER, {
                    startUrls: leadsWithoutEmail.slice(0, 10).map(l => ({ url: `https://${l.website}` })),
                    maxRequestsPerWebsite: 3,
                    sameDomainOnly: true,
                }, onLog);

                for (const contact of contactResults) {
                    const domain = contact.domain || '';
                    const matchingLead = basicLeads.find(l =>
                        l.website && domain.includes(l.website.replace('www.', ''))
                    );

                    if (matchingLead?.decisionMaker) {
                        if (contact.emails?.length > 0) {
                            matchingLead.decisionMaker.email = contact.emails[0];
                            matchingLead.status = 'enriched';
                        }
                        if (contact.phones?.length > 0) matchingLead.decisionMaker.phone = contact.phones[0];
                        if (contact.linkedIn) matchingLead.decisionMaker.linkedin = contact.linkedIn;
                    }
                }
            } catch (e: any) {
                onLog(`[GMAIL] ⚠️ Error enriqueciendo: ${e.message}`);
            }
        }

        // Generate AI analysis
        if (this.openaiKey && this.isRunning) {
            onLog(`[IA] 📊 Generando análisis de leads...`);
            const topLeads = basicLeads.slice(0, 10);

            for (let i = 0; i < topLeads.length && this.isRunning; i++) {
                const lead = topLeads[i];
                lead.aiAnalysis.fullAnalysis = await this.generateLeadAnalysis(lead);
                if (i % 3 === 0) onLog(`[IA] Analizando ${i + 1}/${topLeads.length}...`);
            }
        }

        const enrichedCount = basicLeads.filter(l => l.decisionMaker?.email).length;
        onLog(`[GMAIL] 🎯 COMPLETADO: ${basicLeads.length} leads (${enrichedCount} con email)`);

        onComplete(basicLeads);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LINKEDIN SEARCH - Via Google Search SERP (no cookies needed!)
    // ═══════════════════════════════════════════════════════════════════════════
    private async searchLinkedIn(
        config: SearchConfigState,
        interpreted: { searchQuery: string; industry: string; targetRoles: string[]; location: string },
        onLog: LogCallback,
        onComplete: ResultCallback
    ) {
        // Build Google Search query to find LinkedIn profiles
        const roleTerms = interpreted.targetRoles.slice(0, 2).join(' OR ');
        const searchQuery = `site:linkedin.com/in "${roleTerms}" "${interpreted.industry}" "${interpreted.location}"`;

        onLog(`[LINKEDIN] 💼 Buscando via Google: perfiles de ${interpreted.targetRoles[0]} en ${interpreted.industry}`);

        try {
            const searchInput = {
                queries: searchQuery,
                maxPagesPerQuery: 3,
                resultsPerPage: config.maxResults || 20,
                languageCode: 'es',
                countryCode: 'es',
                mobileResults: false,
            };

            const searchResults = await this.callApifyActor(GOOGLE_SEARCH_SCRAPER, searchInput, onLog);

            // Flatten organic results
            let allResults: any[] = [];
            for (const result of searchResults) {
                if (result.organicResults && Array.isArray(result.organicResults)) {
                    allResults = allResults.concat(result.organicResults);
                }
            }

            // Filter only LinkedIn profile URLs
            const linkedInProfiles = allResults.filter((r: any) =>
                r.url && r.url.includes('linkedin.com/in/')
            );

            onLog(`[LINKEDIN] ✅ ${linkedInProfiles.length} perfiles LinkedIn encontrados`);

            if (!this.isRunning || linkedInProfiles.length === 0) {
                onComplete([]);
                return;
            }

            // Parse LinkedIn profiles from Google results
            const leads: Lead[] = linkedInProfiles.slice(0, config.maxResults || 20).map((result: any, index: number) => {
                // Extract name and role from title: "Juan García - CEO - Empresa | LinkedIn"
                const title = result.title || '';
                const parts = title.split(' - ');
                const name = parts[0]?.replace(' | LinkedIn', '').trim() || '';
                const role = parts[1]?.trim() || this.extractRoleFromText(title);
                const company = parts[2]?.replace(' | LinkedIn', '').trim() || this.extractCompanyFromText(result.description || '');

                return {
                    id: `linkedin-${Date.now()}-${index}`,
                    source: 'linkedin' as const,
                    companyName: company || 'Ver perfil',
                    website: '',
                    socialUrl: result.url,
                    location: interpreted.location,
                    decisionMaker: {
                        name: name,
                        role: role || 'Profesional',
                        email: '',
                        phone: '',
                        linkedin: result.url,
                        facebook: '',
                        instagram: '',
                    },
                    aiAnalysis: {
                        summary: result.description?.substring(0, 150) || `${role} - ${company}`,
                        painPoints: [],
                        generatedIcebreaker: '',
                        fullMessage: '',
                        fullAnalysis: ''
                    },
                    status: 'scraped' as const
                };
            });

            // Generate AI analysis
            if (this.openaiKey && this.isRunning) {
                onLog(`[IA] 📊 Generando análisis de leads...`);

                for (let i = 0; i < leads.length && this.isRunning; i++) {
                    const lead = leads[i];
                    lead.aiAnalysis.fullAnalysis = await this.generateLeadAnalysis(lead);
                    if (i % 3 === 0) onLog(`[IA] Analizando ${i + 1}/${leads.length}...`);
                }
            }

            const withName = leads.filter(l => l.decisionMaker?.name).length;

            onLog(`[LINKEDIN] 🎯 COMPLETADO: ${leads.length} perfiles LinkedIn`);
            onLog(`   • ${withName} con nombre identificado`);

            onComplete(leads);

        } catch (error: any) {
            onLog(`[LINKEDIN] ❌ Error: ${error.message}`);
            onComplete([]);
        }
    }

    private extractRoleFromText(text: string): string {
        const lower = text.toLowerCase();

        if (lower.includes('ceo')) return 'CEO';
        if (lower.includes('founder') || lower.includes('fundador')) return 'Fundador';
        if (lower.includes('co-founder') || lower.includes('cofundador')) return 'Co-Fundador';
        if (lower.includes('owner') || lower.includes('propietario') || lower.includes('dueño')) return 'Propietario';
        if (lower.includes('director general') || lower.includes('managing director')) return 'Director General';
        if (lower.includes('director')) return 'Director';
        if (lower.includes('gerente') || lower.includes('manager')) return 'Gerente';
        if (lower.includes('presidente')) return 'Presidente';

        return '';
    }

    private extractCompanyFromText(text: string): string {
        // Try to find company after "en " or "at "
        const atMatch = text.match(/(?:en|at|@)\s+([A-Z][A-Za-z\s&]+)/);
        if (atMatch) return atMatch[1].trim();

        return '';
    }
}

export const searchService = new SearchService();
