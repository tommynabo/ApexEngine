import { Lead, SearchConfigState } from '../../lib/types';
import { deduplicationService } from '../deduplication/DeduplicationService';

export type LogCallback = (message: string) => void;
export type ResultCallback = (leads: Lead[]) => void;

// Apify Actor IDs
// Apify Actor IDs
const GOOGLE_MAPS_SCRAPER = 'nwua9Gu5YrADL7ZDj';
const CONTACT_SCRAPER = 'vdrmO1lXCkhbPjE9j';
const GOOGLE_SEARCH_SCRAPER = 'nFJndFXA5zjCTuudP'; // ID for apify/google-search-scraper

export class SearchService {
    private isRunning = false;
    private apiKey: string = '';
    private openaiKey: string = '';
    private userId: string | null = null; // For deduplication

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
        psychologicalProfile: string;
        businessMoment: string;
        salesAngle: string;
        personalizedMessage: string;
        bottleneck: string;
    }> {
        if (!this.openaiKey) {
            return {
                fullAnalysis: `${lead.companyName}: ${lead.aiAnalysis?.summary || ''}`,
                psychologicalProfile: 'Análisis no disponible (Sin API Key)',
                businessMoment: 'Desconocido',
                salesAngle: 'Genérico',
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
  "psychologicalProfile": "Describe su perfil en 2 frases (Ej: 'Visionario y directo. Valora la innovación...')",
  "businessMoment": "Deduce en qué fase está la empresa (Ej: 'Expansión agresiva', 'Consolidación', 'Buscando eficiencia')",
  "salesAngle": "El argumento ÚNICO para venderle a ESTA persona hoy.",
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
                        fullAnalysis: `🧠 PERFIL: ${parsed.psychologicalProfile}\n🏢 MOMENTO: ${parsed.businessMoment}\n💡 ÁNGULO: ${parsed.salesAngle}`, // Legacy format for safety
                        psychologicalProfile: parsed.psychologicalProfile || 'No detectado',
                        businessMoment: parsed.businessMoment || 'No detectado',
                        salesAngle: parsed.salesAngle || 'Genérico',
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
            psychologicalProfile: 'No disponible',
            businessMoment: 'Desconocido',
            salesAngle: 'Desconocido',
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

    public async startSearch(
        config: SearchConfigState,
        onLog: LogCallback,
        onComplete: ResultCallback,
        userId?: string | null
    ) {
        this.isRunning = true;
        this.userId = userId || null;

        try {
            this.apiKey = import.meta.env.VITE_APIFY_API_TOKEN || '';
            this.openaiKey = import.meta.env.VITE_OPENAI_API_KEY || '';

            if (!this.apiKey) throw new Error("Falta VITE_APIFY_API_TOKEN en .env");

            // ═══════════════════════════════════════════════════════════════════════════
            // FASE 1: Pre-Flight - Descargar leads existentes del usuario
            // ═══════════════════════════════════════════════════════════════════════════
            onLog(`[DEDUP] 🔍 Iniciando verificación anti-duplicados...`);
            const { existingWebsites, existingCompanyNames } =
                await deduplicationService.fetchExistingLeads(this.userId);

            // ═══════════════════════════════════════════════════════════════════════════
            // Crear un callback intermediario que aplique deduplicación
            // ═══════════════════════════════════════════════════════════════════════════
            const deduplicatedOnComplete = async (rawResults: Lead[]) => {
                // FASE 2: Filtrado - Aplicar deduplicación
                onLog(`[DEDUP] 🎯 Aplicando filtro anti-duplicados (${rawResults.length} candidatos)...`);
                const uniqueLeads = deduplicationService.filterUniqueCandidates(
                    rawResults,
                    existingWebsites,
                    existingCompanyNames
                );

                if (uniqueLeads.length < rawResults.length) {
                    onLog(
                        `[DEDUP] ⚠️ ${rawResults.length - uniqueLeads.length} duplicados eliminados. ` +
                        `Procediendo con ${uniqueLeads.length} leads únicos.`
                    );
                }

                // Llamar al callback original con los resultados deduplicados
                onComplete(uniqueLeads);
            };

            onLog(`[IA] 🧠 Interpretando: "${config.query}"...`);
            const interpreted = await this.interpretQuery(config.query, config.source);
            onLog(`[IA] ✅ Industria: ${interpreted.industry}`);

            if (config.source === 'linkedin') {
                await this.searchLinkedIn(config, interpreted, onLog, deduplicatedOnComplete);
            } else {
                await this.searchGmail(config, interpreted, onLog, deduplicatedOnComplete);
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
        onLog(`[GMAIL] 🗺️ Buscando: "${query}" (Estrategia de Volumen)`);

        // STAGE 1: Google Maps scraping (Over-fetch significantly to filter later)
        const targetCount = config.maxResults || 10;
        const fetchAmount = Math.max(targetCount * 5, 50); // Get at least 50 or 5x target

        const mapsResults = await this.callApifyActor(GOOGLE_MAPS_SCRAPER, {
            searchStringsArray: [query],
            maxCrawledPlacesPerSearch: fetchAmount,
            language: 'es',
            includeWebsiteEmail: true, // Ask Maps to try its best
            scrapeContacts: true,
            maxImages: 0,
            maxReviews: 0,
        }, onLog);

        onLog(`[DEBUG] 🗺️ Maps returned ${mapsResults.length} raw results.`);

        if (mapsResults.length === 0) {
            onLog(`[DEBUG] ⚠️ No specific results found in Maps for query: "${query}"`);
            // Fallback suggestion
            if (query.includes('undefined')) onLog(`[DEBUG] ❌ Query seems malformed (undefined). Check input inputs.`);
        }

        onLog(`[GMAIL] 📊 ${mapsResults.length} empresas encontradas. Filtrando vacíos...`);

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
                fullAnalysis: '',
                psychologicalProfile: '',
                businessMoment: '',
                salesAngle: ''
            },
            status: 'scraped' as const
        }));

        // STAGE 2: Aggressive Contact Enrichment
        // We need to process leads that HAVE a website but NO email
        const needEmail = allLeads.filter(l => !l.decisionMaker?.email && l.website);
        const alreadyHasEmail = allLeads.filter(l => l.decisionMaker?.email);

        onLog(`[GMAIL] ℹ️ Estado actual: ${alreadyHasEmail.length} con email / ${needEmail.length} requieren deep scraping.`);

        if (allLeads.length === 0) {
            onLog(`[DEBUG] ❌ No leads created from Maps results. Check mapping logic.`);
        } else {
            onLog(`[DEBUG] ✅ ${allLeads.length} leads created internally. Checking emails...`);
        }

        if (needEmail.length > 0 && this.isRunning) {
            // Process in batches to avoid timeouts but maximize throughput
            const BATCH_SIZE = 10;
            const batches = Math.ceil(needEmail.length / BATCH_SIZE);

            onLog(`[GMAIL] 🚀 Iniciando extracción masiva de emails en ${needEmail.length} webs...`);

            for (let i = 0; i < batches && this.isRunning; i++) {
                const start = i * BATCH_SIZE;
                const end = start + BATCH_SIZE;
                const batch = needEmail.slice(start, end);

                onLog(`[GMAIL] 📥 Procesando lote ${i + 1}/${batches} (${batch.length} webs)...`);

                try {
                    const contactResults = await this.callApifyActor(CONTACT_SCRAPER, {
                        startUrls: batch.map(l => ({ url: `https://${l.website}` })),
                        maxRequestsPerWebsite: 3, // Fast check
                        sameDomainOnly: true,
                        maxCrawlingDepth: 1, // Only check homepage and contact page usually
                    }, (msg) => { }); // Silent logs for sub-process to avoid spam

                    // Map results back to leads
                    for (const contact of contactResults) {
                        const contactUrl = contact.url || '';
                        // Find matching lead by domain
                        const match = batch.find(l => {
                            if (!l.website) return false;
                            return contactUrl.includes(l.website.replace('www.', ''));
                        });

                        if (match && contact.emails?.length) {
                            // Use Set to deduplicate and ignore trash emails like 'wix', 'sentry', etc.
                            const validEmails = contact.emails.filter((e: string) =>
                                !e.includes('sentry') && !e.includes('noreply') && !e.includes('wix') && e.includes('@')
                            );

                            if (validEmails.length > 0) {
                                match.decisionMaker.email = validEmails[0];
                                onLog(`[GMAIL] 📧 Email encontrado para ${match.companyName}: ${validEmails[0]}`);
                            }
                        }
                    }
                } catch (e: any) {
                    onLog(`[GMAIL] ⚠️ Fallo en lote ${i + 1}: ${e.message}`);
                }

                // If we have enough leads now, maybe stop? For now, let's just go through.
                const currentTotal = allLeads.filter(l => l.decisionMaker?.email).length;
                if (currentTotal >= targetCount) {
                    onLog(`[GMAIL] ✅ Objetivo de leads alcanzado (${currentTotal}). Deteniendo scraping.`);
                    break;
                }
            }
        }

        const afterScrapingTotal = allLeads.filter(l => l.decisionMaker?.email).length;
        onLog(`[DEBUG] 📊 Total with emails after scraping: ${afterScrapingTotal}`);

        // ⚡ FILTER FINAL: ONLY leads with email
        const finalCandidates = allLeads.filter(l => l.decisionMaker?.email);

        onLog(`[DEBUG] 🔍 Filtering finals: ${allLeads.length} total -> ${finalCandidates.length} with email.`);

        if (finalCandidates.length === 0) {
            onLog(`[ERROR] ❌ CRÍTICO: No se encontraron emails válidos tras el scraping profundo.`);
            onLog(`[HINT] Intenta buscar un sector más digitalizado o aumenta el área de búsqueda.`);
            onComplete([]);
            return;
        }

        // Limit to requested amount
        const finalLeads = finalCandidates.slice(0, targetCount);

        onLog(`[GMAIL] 💎 Generando Icebreakers para ${finalLeads.length} leads validados...`);

        // STAGE 3: Quick AI analysis (Icebreakers only for speed/volume)
        if (this.openaiKey && this.isRunning) {
            for (let i = 0; i < finalLeads.length && this.isRunning; i++) {
                const lead = finalLeads[i];
                // Lighter analysis for volume
                lead.aiAnalysis.generatedIcebreaker = `Hola, he visto vuestra web ${lead.website} y me encaja mucho para...`;
                lead.status = 'ready';

                // Only do full deep research if it's a small batch (<20), otherwise just simple icebreaker
                if (finalLeads.length <= 20) {
                    const research = await this.deepResearchLead(lead, (m) => { });
                    const analysis = await this.generateUltraAnalysis(lead, research);
                    lead.aiAnalysis.fullAnalysis = analysis.fullAnalysis;
                    lead.aiAnalysis.psychologicalProfile = analysis.psychologicalProfile;
                    lead.aiAnalysis.businessMoment = analysis.businessMoment;
                    lead.aiAnalysis.salesAngle = analysis.salesAngle;
                    lead.aiAnalysis.fullMessage = analysis.personalizedMessage;
                    lead.aiAnalysis.generatedIcebreaker = analysis.bottleneck;
                } else {
                    // Fast path
                    lead.aiAnalysis.fullMessage = `Hola, vi vuestro negocio en ${lead.location}...`;
                    lead.aiAnalysis.summary = "Lead cualificado por volumen";
                    lead.aiAnalysis.psychologicalProfile = "N/A (Modo Volumen)";
                    lead.aiAnalysis.businessMoment = "Operativo";
                    lead.aiAnalysis.salesAngle = "Eficiencia/Escala";
                }
            }
        }

        onLog(`[GMAIL] 🏁 PROCESO FINALIZADO: ${finalLeads.length} leads ultra-cualificados con email`);
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

            onLog(`[DEBUG] 🔍 Total Google Organic Results: ${allResults.length}`);

            const linkedInProfiles = allResults.filter((r: any) => r.url?.includes('linkedin.com/in/'));
            onLog(`[DEBUG] 👤 Detected LinkedIn Profiles: ${linkedInProfiles.length}`);

            if (linkedInProfiles.length > 0) {
                onLog(`[DEBUG] First profile found: ${linkedInProfiles[0].title} - ${linkedInProfiles[0].url}`);
            }

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
                        psychologicalProfile: analysis.psychologicalProfile,
                        businessMoment: analysis.businessMoment,
                        salesAngle: analysis.salesAngle,
                        fullMessage: analysis.personalizedMessage,
                        generatedIcebreaker: analysis.bottleneck,
                        painPoints: []
                    },
                    status: 'ready'
                });
            }

            onLog(`[DEBUG] ✨ Added lead to final list: ${name}`);
        }

            onLog(`[LINKEDIN] 🏁 Proceso finalizado. ${finalLeads.length} leads analizados y listos.`);
        onComplete(finalLeads);

    } catch(error: any) {
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
