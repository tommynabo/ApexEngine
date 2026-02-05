import { Lead, SearchConfigState } from '../../lib/types';

export type LogCallback = (message: string) => void;
export type ResultCallback = (leads: Lead[]) => void;

// Apify Actor IDs
const GOOGLE_MAPS_SCRAPER = 'nwua9Gu5YrADL7ZDj';
const CONTACT_SCRAPER = 'vdrmO1lXCkhbPjE9j';
const GOOGLE_SEARCH_SCRAPER = 'apify/google-search-scraper';

export class SearchService {
    private isRunning = false;
    private apiKey: string = '';
    private openaiKey: string = '';

    public stop() {
        this.isRunning = false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SMART QUERY INTERPRETER
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
                            content: `Eres un experto en prospección B2B. Interpreta la búsqueda para encontrar DUEÑOS y DECISORES.
Responde SOLO con JSON:
{
  "searchQuery": "término optimizado",
  "industry": "sector detectado",
  "targetRoles": ["CEO", "Fundador", etc],
  "location": "ubicación o España"
}`
                        },
                        { role: 'user', content: `Búsqueda: "${userQuery}"` }
                    ],
                    temperature: 0.3,
                    max_tokens: 150
                })
            });
            const data = await response.json();
            const match = data.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch (e) { console.error(e); }

        return { searchQuery: userQuery, industry: userQuery, targetRoles: ['CEO', 'Fundador', 'Propietario'], location: 'España' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEEP RESEARCH - Google Search for company/owner info
    // ═══════════════════════════════════════════════════════════════════════════
    private async deepResearchLead(lead: Lead, onLog: LogCallback): Promise<string> {
        if (!this.isRunning) return '';

        const searchQueries = [];

        // Research company
        if (lead.companyName && lead.companyName !== 'Sin Nombre') {
            searchQueries.push(`"${lead.companyName}" empresa valores misión`);
        }

        // Research owner if we have a name
        if (lead.decisionMaker?.name) {
            searchQueries.push(`"${lead.decisionMaker.name}" ${lead.companyName} entrevista`);
            searchQueries.push(`"${lead.decisionMaker.name}" linkedin`);
        }

        // Research from website
        if (lead.website) {
            searchQueries.push(`site:${lead.website} "sobre nosotros" OR "quiénes somos" OR "about"`);
        }

        if (searchQueries.length === 0) return '';

        try {
            const searchInput = {
                queries: searchQueries.join('\n'),
                maxPagesPerQuery: 1,
                resultsPerPage: 5,
                languageCode: 'es',
                countryCode: 'es',
            };

            const results = await this.callApifyActor(GOOGLE_SEARCH_SCRAPER, searchInput, (msg) => { }); // Silent

            let researchData = '';
            for (const result of results) {
                if (result.organicResults) {
                    for (const organic of result.organicResults.slice(0, 3)) {
                        researchData += `\n- ${organic.title}: ${organic.description || ''}`;
                    }
                }
            }

            return researchData;
        } catch (e) {
            return '';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ULTRA-COMPLETE AI ANALYSIS - Psychological + Business + Bottleneck
    // ═══════════════════════════════════════════════════════════════════════════
    private async generateUltraAnalysis(lead: Lead, researchData: string): Promise<{
        fullAnalysis: string;
        personalizedMessage: string;
        bottleneck: string;
    }> {
        if (!this.openaiKey) {
            return {
                fullAnalysis: `${lead.companyName}: ${lead.aiAnalysis?.summary || ''}`,
                personalizedMessage: '',
                bottleneck: ''
            };
        }

        const context = `
═══ DATOS DEL LEAD ═══
Empresa: ${lead.companyName}
Web: ${lead.website || 'No disponible'}
Ubicación: ${lead.location || 'España'}
Decisor: ${lead.decisionMaker?.name || 'No identificado'}
Cargo: ${lead.decisionMaker?.role || 'Propietario'}
Email: ${lead.decisionMaker?.email || 'No disponible'}
LinkedIn: ${lead.decisionMaker?.linkedin || 'No disponible'}
Resumen inicial: ${lead.aiAnalysis?.summary || ''}

═══ INVESTIGACIÓN ADICIONAL ═══
${researchData || 'Sin datos adicionales'}
        `.trim();

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
                            content: `Eres un GENIO del análisis de negocios y psicología empresarial. Tu trabajo es hacer el análisis MÁS COMPLETO posible de cada lead para ventas B2B.

DEBES generar exactamente este JSON (sin markdown, solo JSON puro):
{
  "fullAnalysis": "Análisis ultra-completo de 200-300 palabras que incluya:
    1. PERFIL DE EMPRESA: Qué hacen, cómo trabajan, tamaño estimado
    2. PERFIL PSICOLÓGICO DEL DECISOR: Basándote en su cargo, industria y cualquier info, deduce cómo piensa, qué le preocupa, qué le motiva
    3. MÉTODO DE TRABAJO: Cómo probablemente opera el negocio
    4. PAIN POINTS: 3 problemas específicos que seguro tiene
    5. OPORTUNIDAD DE VENTA: Por qué es buen prospecto",
    
  "bottleneck": "Una frase BRUTAL y específica sobre el cuello de botella principal. Ejemplo: 'Están perdiendo el 40% de clientes potenciales porque no tienen seguimiento automatizado de leads'",
  
  "personalizedMessage": "Mensaje de prospección de 100-150 palabras MUY personalizado. Debe:
    - Mencionar algo específico de su empresa/situación
    - Tocar el pain point principal
    - Proponer valor sin vender directamente
    - Terminar con CTA suave
    - Tono profesional pero cercano"
}

IMPORTANTE: Responde SOLO con JSON válido, sin explicaciones adicionales.`
                        },
                        {
                            role: 'user',
                            content: `Analiza este lead y genera el JSON:\n\n${context}`
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 1000
                })
            });

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';

            // Parse JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    fullAnalysis: parsed.fullAnalysis || '',
                    personalizedMessage: parsed.personalizedMessage || '',
                    bottleneck: parsed.bottleneck || ''
                };
            }
        } catch (e) {
            console.error('Error generating ultra analysis:', e);
        }

        return { fullAnalysis: '', personalizedMessage: '', bottleneck: '' };
    }

    private async callApifyActor(actorId: string, input: any, onLog: LogCallback): Promise<any[]> {
        const startUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${this.apiKey}`;

        const startResponse = await fetch(startUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
        });

        if (!startResponse.ok) {
            const err = await startResponse.text();
            throw new Error(`Error actor ${actorId}: ${err}`);
        }

        const startData = await startResponse.json();
        const runId = startData.data.id;
        const defaultDatasetId = startData.data.defaultDatasetId;

        onLog(`[APIFY] Actor iniciado`);

        let isFinished = false;
        let pollCount = 0;
        while (!isFinished && this.isRunning && pollCount < 60) {
            await new Promise(r => setTimeout(r, 5000));
            pollCount++;

            const statusRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs/${runId}?token=${this.apiKey}`);
            const statusData = await statusRes.json();
            const status = statusData.data.status;

            if (pollCount % 4 === 0) onLog(`[APIFY] Estado: ${status}`);

            if (status === 'SUCCEEDED') isFinished = true;
            else if (status === 'FAILED' || status === 'ABORTED') throw new Error(`Actor falló: ${status}`);
        }

        if (!this.isRunning) return [];

        const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${this.apiKey}`);
        return await itemsRes.json();
    }

    public async startSearch(config: SearchConfigState, onLog: LogCallback, onComplete: ResultCallback) {
        this.isRunning = true;

        try {
            this.apiKey = import.meta.env.VITE_APIFY_API_TOKEN || '';
            this.openaiKey = import.meta.env.VITE_OPENAI_API_KEY || '';

            if (!this.apiKey) throw new Error("Falta VITE_APIFY_API_TOKEN en .env");

            onLog(`[IA] 🧠 Interpretando: "${config.query}"...`);
            const interpreted = await this.interpretQuery(config.query, config.source);
            onLog(`[IA] ✅ Industria: ${interpreted.industry}`);

            if (config.source === 'linkedin') {
                await this.searchLinkedIn(config, interpreted, onLog, onComplete);
            } else {
                await this.searchGmail(config, interpreted, onLog, onComplete);
            }

        } catch (error: any) {
            onLog(`[ERROR] ❌ ${error.message}`);
            onComplete([]);
        } finally {
            this.isRunning = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GMAIL SEARCH - Ultra completo
    // ═══════════════════════════════════════════════════════════════════════════
    private async searchGmail(
        config: SearchConfigState,
        interpreted: { searchQuery: string; industry: string; targetRoles: string[]; location: string },
        onLog: LogCallback,
        onComplete: ResultCallback
    ) {
        const query = `${interpreted.searchQuery} ${interpreted.location}`;
        onLog(`[GMAIL] 🗺️ Buscando: "${query}"`);

        // STAGE 1: Google Maps scraping
        const mapsResults = await this.callApifyActor(GOOGLE_MAPS_SCRAPER, {
            searchStringsArray: [query],
            maxCrawledPlacesPerSearch: Math.ceil((config.maxResults || 10) * 2), // Get more, then filter
            language: 'es',
            includeWebsiteEmail: true,
            scrapeContacts: true,
            maxImages: 0,
            maxReviews: 0,
        }, onLog);

        onLog(`[GMAIL] 📊 ${mapsResults.length} empresas encontradas, filtrando...`);

        // Convert to leads
        let allLeads: Lead[] = mapsResults.map((item: any, index: number) => ({
            id: String(item.placeId || `lead-${Date.now()}-${index}`),
            source: 'gmail' as const,
            companyName: item.title || item.name || 'Sin Nombre',
            website: item.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || '',
            location: item.address || item.fullAddress || '',
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
                summary: `${item.categoryName || interpreted.industry} - ${item.reviewsCount || 0} reseñas (${item.totalScore || 'N/A'}⭐)`,
                painPoints: [],
                generatedIcebreaker: '',
                fullMessage: '',
                fullAnalysis: ''
            },
            status: 'scraped' as const
        }));

        // STAGE 2: Enrich leads without email
        const needEmail = allLeads.filter(l => !l.decisionMaker?.email && l.website);
        if (needEmail.length > 0 && this.isRunning) {
            onLog(`[GMAIL] 🔍 Enriqueciendo ${needEmail.length} leads sin email...`);

            try {
                const contactResults = await this.callApifyActor(CONTACT_SCRAPER, {
                    startUrls: needEmail.slice(0, 15).map(l => ({ url: `https://${l.website}` })),
                    maxRequestsPerWebsite: 5,
                    sameDomainOnly: true,
                }, onLog);

                for (const contact of contactResults) {
                    const domain = contact.domain || '';
                    const match = allLeads.find(l => l.website && domain.includes(l.website.replace('www.', '')));
                    if (match?.decisionMaker && contact.emails?.length) {
                        match.decisionMaker.email = contact.emails[0];
                        if (contact.phones?.length) match.decisionMaker.phone = contact.phones[0];
                        if (contact.linkedIn) match.decisionMaker.linkedin = contact.linkedIn;
                    }
                }
            } catch (e: any) {
                onLog(`[GMAIL] ⚠️ Error enriqueciendo: ${e.message}`);
            }
        }

        // ⚡ FILTER: ONLY leads with email (critical requirement!)
        onLog(`[DEBUG] Total leads antes de filtrar: ${allLeads.length}`);
        onLog(`[DEBUG] Leads con email directo de Maps: ${allLeads.filter(l => l.decisionMaker?.email).length}`);

        const leadsWithEmail = allLeads.filter(l => l.decisionMaker?.email);
        onLog(`[GMAIL] ✅ ${leadsWithEmail.length} leads CON EMAIL (descartados ${allLeads.length - leadsWithEmail.length} sin email)`);

        // Limit to requested amount
        const finalLeads = leadsWithEmail.slice(0, config.maxResults || 10);

        // STAGE 3: Deep research + Ultra analysis for each lead
        if (this.openaiKey && this.isRunning && finalLeads.length > 0) {
            onLog(`[RESEARCH] 🔬 Iniciando investigación profunda de ${finalLeads.length} leads...`);

            for (let i = 0; i < finalLeads.length && this.isRunning; i++) {
                const lead = finalLeads[i];
                onLog(`[RESEARCH] ${i + 1}/${finalLeads.length}: ${lead.companyName}...`);

                // Deep research via Google
                const researchData = await this.deepResearchLead(lead, onLog);

                // Ultra AI analysis
                const analysis = await this.generateUltraAnalysis(lead, researchData);

                lead.aiAnalysis.fullAnalysis = analysis.fullAnalysis;
                lead.aiAnalysis.fullMessage = analysis.personalizedMessage;
                lead.aiAnalysis.generatedIcebreaker = analysis.bottleneck;
                lead.status = 'ready';
            }
        }

        onLog(`[GMAIL] 🎯 COMPLETADO: ${finalLeads.length} leads ultra-cualificados con email`);
        onComplete(finalLeads);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LINKEDIN SEARCH
    // ═══════════════════════════════════════════════════════════════════════════
    private async searchLinkedIn(
        config: SearchConfigState,
        interpreted: { searchQuery: string; industry: string; targetRoles: string[]; location: string },
        onLog: LogCallback,
        onComplete: ResultCallback
    ) {
        const roleTerms = interpreted.targetRoles.slice(0, 2).join(' OR ');
        const searchQuery = `site:linkedin.com/in "${roleTerms}" "${interpreted.industry}" "${interpreted.location}"`;

        onLog(`[LINKEDIN] 💼 Buscando perfiles de ${interpreted.targetRoles[0]} en ${interpreted.industry}...`);

        try {
            const searchResults = await this.callApifyActor(GOOGLE_SEARCH_SCRAPER, {
                queries: searchQuery,
                maxPagesPerQuery: 3,
                resultsPerPage: config.maxResults || 20,
                languageCode: 'es',
                countryCode: 'es',
            }, onLog);

            let allResults: any[] = [];
            for (const result of searchResults) {
                if (result.organicResults) allResults = allResults.concat(result.organicResults);
            }

            const linkedInProfiles = allResults.filter((r: any) => r.url?.includes('linkedin.com/in/'));
            onLog(`[LINKEDIN] ✅ ${linkedInProfiles.length} perfiles encontrados`);

            if (!this.isRunning || linkedInProfiles.length === 0) {
                onComplete([]);
                return;
            }

            const leads: Lead[] = linkedInProfiles.slice(0, config.maxResults || 10).map((result: any, index: number) => {
                const title = result.title || '';
                const parts = title.split(' - ');
                const name = parts[0]?.replace(' | LinkedIn', '').trim() || '';
                const role = parts[1]?.trim() || this.extractRole(title);
                const company = parts[2]?.replace(' | LinkedIn', '').trim() || '';

                return {
                    id: `linkedin-${Date.now()}-${index}`,
                    source: 'linkedin' as const,
                    companyName: company || 'Ver perfil',
                    website: '',
                    socialUrl: result.url,
                    location: interpreted.location,
                    decisionMaker: {
                        name, role: role || 'Profesional', email: '', phone: '',
                        linkedin: result.url, facebook: '', instagram: '',
                    },
                    aiAnalysis: {
                        summary: result.description?.substring(0, 150) || `${role} - ${company}`,
                        painPoints: [], generatedIcebreaker: '', fullMessage: '', fullAnalysis: ''
                    },
                    status: 'scraped' as const
                };
            });

            // Deep research + Ultra analysis
            if (this.openaiKey && this.isRunning) {
                onLog(`[RESEARCH] 🔬 Investigación profunda de ${leads.length} perfiles...`);

                for (let i = 0; i < leads.length && this.isRunning; i++) {
                    const lead = leads[i];
                    onLog(`[RESEARCH] ${i + 1}/${leads.length}: ${lead.decisionMaker?.name || lead.companyName}...`);

                    const researchData = await this.deepResearchLead(lead, onLog);
                    const analysis = await this.generateUltraAnalysis(lead, researchData);

                    lead.aiAnalysis.fullAnalysis = analysis.fullAnalysis;
                    lead.aiAnalysis.fullMessage = analysis.personalizedMessage;
                    lead.aiAnalysis.generatedIcebreaker = analysis.bottleneck;
                    lead.status = 'ready';
                }
            }

            onLog(`[LINKEDIN] 🎯 COMPLETADO: ${leads.length} perfiles analizados`);
            onComplete(leads);

        } catch (error: any) {
            onLog(`[LINKEDIN] ❌ Error: ${error.message}`);
            onComplete([]);
        }
    }

    private extractRole(text: string): string {
        const lower = text.toLowerCase();
        if (lower.includes('ceo')) return 'CEO';
        if (lower.includes('founder') || lower.includes('fundador')) return 'Fundador';
        if (lower.includes('owner') || lower.includes('propietario')) return 'Propietario';
        if (lower.includes('director')) return 'Director';
        return '';
    }
}

export const searchService = new SearchService();
