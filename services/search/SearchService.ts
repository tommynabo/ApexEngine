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

        const MAX_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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

SI HAY DATOS DE "ACTIVIDAD RECIENTE (Posts)":
- Analiza su estilo de escritura (Directo, Reflexivo, Técnico, Vendedor).
- Deduce sus valores y qué temas le obsesionan ahora mismo.
- Úsalo para personalizar el mensaje al máximo.

DEBES generar exactamente este JSON (sin markdown, solo JSON puro):
{
  "fullAnalysis": "Análisis de 200-300 palabras. ESTRUCTURA OBLIGATORIA:
    1. 🧠 PERFIL PSICOLÓGICO: Tono, estilo, drivers mentales.
    2. 🏢 MOMENTO EMPRESARIAL: Situación actual deducida.
    3. 🎯 PUNTOS DE DOLOR: 3 problemas críticos.
    4. 💡 ÁNGULO DE VENTA: Por qué flipearán con nosotros.",

  "bottleneck": "Una frase BRUTAL y específica sobre su mayor freno o cuello de botella detectado.",
  
  "personalizedMessage": "Mensaje de 100 palabras. Tono 'Coffee Chat' profesional. MENCIONA SU ÚLTIMO POST O ACTIVIDAD si existe."
}

IMPORTANTE: Responde SOLO con JSON válido.`
                            },
                            {
                                role: 'user',
                                content: `Analiza este lead (Intento ${attempt}):\n\n${context}`
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 1000
                    })
                });

                if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

                const data = await response.json();
                const content = data.choices?.[0]?.message?.content || '';
                const jsonMatch = content.match(/\{[\s\S]*\}/);

                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return {
                        fullAnalysis: parsed.fullAnalysis || `Análisis de ${lead.companyName}`,
                        personalizedMessage: parsed.personalizedMessage || `Hola ${lead.decisionMaker?.name || 'equipo'}, me gustaría contactar con vosotros.`,
                        bottleneck: parsed.bottleneck || 'Oportunidad de mejora detectada'
                    };
                }
            } catch (e) {
                console.error(`Attempt ${attempt} failed:`, e);
                if (attempt === MAX_RETRIES) break;
                await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
            }
        }

        // Fallback if all AI attempts fail
        return {
            fullAnalysis: `Análisis automático no disponible. Revisar perfil de ${lead.companyName}.`,
            personalizedMessage: `Hola ${lead.decisionMaker?.name || 'Responsable'}, he visto vuestra web ${lead.website} y me gustaría comentar una oportunidad de colaboración.`,
            bottleneck: 'Revisión manual requerida'
        };
    }

    private async callApifyActor(actorId: string, input: any, onLog: LogCallback): Promise<any[]> {
        // Use local proxy to avoid CORS
        const baseUrl = '/api/apify';
        const startUrl = `${baseUrl}/acts/${actorId}/runs?token=${this.apiKey}`;

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

            const statusRes = await fetch(`${baseUrl}/acts/${actorId}/runs/${runId}?token=${this.apiKey}`);
            const statusData = await statusRes.json();
            const status = statusData.data.status;

            if (pollCount % 4 === 0) onLog(`[APIFY] Estado: ${status}`);

            if (status === 'SUCCEEDED') isFinished = true;
            else if (status === 'FAILED' || status === 'ABORTED') throw new Error(`Actor falló: ${status}`);
        }

        if (!this.isRunning) return [];

        const itemsRes = await fetch(`${baseUrl}/datasets/${defaultDatasetId}/items?token=${this.apiKey}`);
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
            maxCrawledPlacesPerSearch: Math.ceil((config.maxResults || 10) * 3), // Get 3x more, then filter
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
                    // Try to match by website domain more flexibly
                    const contactUrl = contact.url || '';
                    const match = allLeads.find(l => {
                        if (!l.website) return false;
                        const leadDomain = l.website.replace('www.', '').split('/')[0];
                        return contactUrl.includes(leadDomain);
                    });

                    if (match && contact.emails?.length) {
                        const newEmail = contact.emails[0];
                        if (!match.decisionMaker) match.decisionMaker = {} as any;
                        if (!match.decisionMaker.email) { // Only set if empty
                            match.decisionMaker.email = newEmail;
                            onLog(`[GMAIL] 📧 Email encontrado para ${match.companyName}: ${newEmail}`);
                        }
                    }
                }
            } catch (e: any) {
                onLog(`[GMAIL] ⚠️ Error enriqueciendo: ${e.message}`);
            }
        }

        // ⚡ FILTER: ONLY leads with email (critical requirement!)
        onLog(`[DEBUG] Total leads antes de filtrar: ${allLeads.length}`);

        const leadsWithEmail = allLeads.filter(l => l.decisionMaker?.email);
        const discardedCount = allLeads.length - leadsWithEmail.length;

        onLog(`[GMAIL] ✅ ${leadsWithEmail.length} leads CON EMAIL`);
        if (discardedCount > 0) {
            onLog(`[GMAIL] 🗑️ ${discardedCount} descartados por falta de email (verificado automáticamente)`);
        }

        if (leadsWithEmail.length === 0) {
            onLog(`[ERROR] ❌ No se encontraron leads con email. Intenta una búsqueda más específica.`);
            onComplete([]);
            return;
        }

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
    // LINKEDIN SEARCH - DEEP RESEARCH + PSYCHOLOGY
    // ═══════════════════════════════════════════════════════════════════════════
    private async searchLinkedIn(
        config: SearchConfigState,
        interpreted: { searchQuery: string; industry: string; targetRoles: string[]; location: string },
        onLog: LogCallback,
        onComplete: ResultCallback
    ) {
        // 1. ACTIVE SEARCH (Búsqueda Activa)
        const roleTerms = interpreted.targetRoles.slice(0, 2).join(' OR ');
        const activeQuery = `site:linkedin.com/in ${roleTerms} "${interpreted.industry}" "${interpreted.location}"`;

        onLog(`[LINKEDIN] 🕵️‍♂️ Iniciando BÚSQUEDA ACTIVA`);
        onLog(`[LINKEDIN] 🎯 Query: ${activeQuery}`);

        try {
            // STEP 1: Discovery via Google
            const searchResults = await this.callApifyActor(GOOGLE_SEARCH_SCRAPER, {
                queries: activeQuery,
                maxPagesPerQuery: 2,
                resultsPerPage: config.maxResults || 15,
                languageCode: 'es',
                countryCode: 'es',
            }, onLog);

            let allResults: any[] = [];
            for (const result of searchResults) {
                if (result.organicResults) allResults = allResults.concat(result.organicResults);
            }

            const linkedInProfiles = allResults.filter((r: any) => r.url?.includes('linkedin.com/in/'));
            onLog(`[LINKEDIN] 📋 ${linkedInProfiles.length} perfiles detectados.`);

            if (!this.isRunning || linkedInProfiles.length === 0) {
                onLog(`[LINKEDIN] ❌ No se encontraron perfiles. Intenta ampliar la zona.`);
                onComplete([]);
                return;
            }

            // STEP 2: Deep Analysis (Posts + Psych Profile)
            const potentialLeads = linkedInProfiles.slice(0, (config.maxResults || 5)); // Process fewer for deep analysis speed
            const finalLeads: Lead[] = [];

            // Actor for posts (from the JSON reference)
            const POSTS_SCRAPER = 'LQQIXN9Othf8f7R5n'; // apimaestro/linkedin-profile-posts

            for (let i = 0; i < potentialLeads.length && this.isRunning; i++) {
                const profile = potentialLeads[i];
                onLog(`[RESEARCH] 🧠 Analizando candidato ${i + 1}/${potentialLeads.length}: ${profile.title.split(' - ')[0]}...`);

                // Parse Basic Info
                const titleParts = (profile.title || '').split(' - ');
                const name = titleParts[0]?.replace(' | LinkedIn', '').trim() || 'Usuario LinkedIn';
                const role = this.extractRole(profile.title) || 'Decisor';
                const company = this.extractCompany(profile.title) || 'Empresa Desconocida';

                // STEP 3: Scrape Recent Posts (The "Extra Step")
                let recentPostsText = "";
                let writingStyle = "Desconocido";

                try {
                    onLog(`[RESEARCH] 📲 Obteniendo actividad reciente (Posts)...`);
                    const postsData = await this.callApifyActor(POSTS_SCRAPER, {
                        username: profile.url,
                        limit: 3 // Analyze last 3 posts
                    }, () => { }); // Silent log for sub-task

                    if (postsData && postsData.length > 0) {
                        recentPostsText = postsData.map((p: any) => `POST (${p.date || 'Reciente'}): ${p.text?.substring(0, 200)}...`).join('\n');
                        onLog(`[RESEARCH] ✅ ${postsData.length} posts recuperados para análisis.`);
                    } else {
                        onLog(`[RESEARCH] ⚠️ Sin actividad reciente accesible.`);
                    }
                } catch (e) {
                    onLog(`[RESEARCH] ⚠️ No se pudieron leer posts (Perfil privado o error).`);
                }

                // STEP 4: Psychological Analysis
                const researchDossier = `
                PERFIL:
                Nombre: ${name}
                Headline: ${profile.title}
                Snippet: ${profile.description}
                URL: ${profile.url}
                
                ACTIVIDAD RECIENTE (Posts):
                ${recentPostsText || "No hay posts recientes disponibles."}
                `;

                const analysis = await this.generateUltraAnalysis({
                    companyName: company,
                    decisionMaker: { name, role, linkedin: profile.url }
                } as Lead, researchDossier);

                finalLeads.push({
                    id: `linkedin-psych-${Date.now()}-${i}`,
                    source: 'linkedin',
                    companyName: company,
                    website: '', // We could search this, but focusing on Profile now
                    location: interpreted.location,
                    decisionMaker: {
                        name,
                        role,
                        email: '', // Email is secondary in this flow
                        phone: '',
                        linkedin: profile.url
                    },
                    aiAnalysis: {
                        summary: `Perfil Psicológico: ${analysis.bottleneck}`, // Using bottleneck field for psych summary
                        fullAnalysis: analysis.fullAnalysis,
                        fullMessage: analysis.personalizedMessage,
                        generatedIcebreaker: analysis.bottleneck,
                        painPoints: []
                    },
                    status: 'ready'
                });
            }

            onLog(`[LINKEDIN] 🏁 Proceso finalizado. ${finalLeads.length} leads analizados.`);
            onComplete(finalLeads);

        } catch (error: any) {
            onLog(`[LINKEDIN] ❌ Error: ${error.message}`);
            onComplete([]);
        }
    }

    private extractCompany(text: string): string {
        // Heuristic: "CEO en [Empresa]" or "CEO at [Company]"
        const atMatch = text.match(/\b(en|at|@)\s+([^|\-.,]+)/i);
        if (atMatch && atMatch[2]) return atMatch[2].trim();
        return '';
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
