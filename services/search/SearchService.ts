import { Lead, SearchConfigState } from '../../lib/types';
import { deduplicationService } from '../deduplication/DeduplicationService';

export type LogCallback = (message: string) => void;
export type ResultCallback = (leads: Lead[]) => void;

// Apify Actor IDs
const CONTACT_SCRAPER = 'vdrmO1lXCkhbPjE9j';
const GOOGLE_SEARCH_SCRAPER = 'nFJndFXA5zjCTuudP'; // apify/google-search-scraper

export class SearchService {
    private isRunning = false;
    private apiKey: string = '';
    private userId: string | null = null; // For deduplication

    public stop() {
        this.isRunning = false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SMART QUERY INTERPRETER
    // ═══════════════════════════════════════════════════════════════════════════
    private async interpretQuery(userQuery: string, platform: 'gmail' | 'linkedin' | 'instagram'): Promise<{
        searchQuery: string;
        industry: string;
        targetRoles: string[];
        location: string;
    }> {
        try {
            console.log('[INTERPRET] 📡 Llamando /api/openai...');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000); // 300 sec timeout (uncapped)

            // Llamar a nuestra API route privada en lugar de OpenAI directamente
            const response = await fetch('/api/openai', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json'
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
            clearTimeout(timeoutId);

            if (!response.ok) {
                const err = await response.text();
                console.error(`[INTERPRET] HTTP ${response.status}:`, err.substring(0, 300));
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const match = data.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/);
            if (match) {
                console.log('[INTERPRET] ✅ Query interpretada exitosamente');
                return JSON.parse(match[0]);
            }
        } catch (e: any) {
            console.error('[INTERPRET] Error:', e.message);
        }

        console.log('[INTERPRET] ⚠️ Fallback: usando query as-is');
        return { searchQuery: userQuery, industry: userQuery, targetRoles: ['CEO', 'Fundador', 'Propietario'], location: 'España' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADVANCED FILTERS PROCESSOR
    // ═══════════════════════════════════════════════════════════════════════════
    private buildQueryWithAdvancedFilters(baseQuery: string, filters?: any): string {
        if (!filters || !Object.keys(filters).length) {
            return baseQuery;
        }

        const parts = [baseQuery];

        // Add locations to query
        if (filters.locations && filters.locations.length > 0) {
            parts.push(`(${filters.locations.map((loc: string) => `"${loc}"`).join(' OR ')})`);
        }

        // Add job titles to query
        if (filters.jobTitles && filters.jobTitles.length > 0) {
            parts.push(`(${filters.jobTitles.map((job: string) => `"${job}"`).join(' OR ')})`);
        }

        // Add industries to query
        if (filters.industries && filters.industries.length > 0) {
            parts.push(`(${filters.industries.map((ind: string) => `"${ind}"`).join(' OR ')})`);
        }

        // Add keywords to query
        if (filters.keywords && filters.keywords.length > 0) {
            parts.push(`(${filters.keywords.map((key: string) => `"${key}"`).join(' OR ')})`);
        }

        return parts.join(' AND ');
    }

    /**
     * Check if a lead matches advanced filter criteria
     */
    private leadMatchesFilters(lead: Lead, filters?: any): boolean {
        if (!filters) return true;

        try {
            // Check locations
            if (filters.locations && filters.locations.length > 0) {
                const leadLocation = (lead.location || '').toLowerCase();
                const matchesLocation = filters.locations.some((loc: string) =>
                    leadLocation.includes(loc.toLowerCase())
                );
                if (!matchesLocation) return false;
            }

            // Check company sizes (if available in lead data)
            if (filters.companySizes && filters.companySizes.length > 0) {
                // Company size usually comes from summary/analysis
                const summary = (lead.aiAnalysis?.summary || '').toLowerCase();
                const matchesSize = filters.companySizes.some((size: string) => {
                    if (size === 'startup') return summary.includes('1-50') || summary.includes('pequeña');
                    if (size === 'small') return summary.includes('1-100') || summary.includes('pequeña');
                    if (size === 'medium') return summary.includes('100-1000') || summary.includes('mediana');
                    if (size === 'large') return summary.includes('1000+') || summary.includes('grande');
                    return summary.includes(size);
                });
                if (!matchesSize && filters.companySizes.length > 0) return false;
            }

            return true;
        } catch (e) {
            return true; // If filtering fails, keep the lead
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SKOOL SEARCH — Google Dorks targeting Skool community creators
    // ═══════════════════════════════════════════════════════════════════════════
    private async searchSkool(
        config: SearchConfigState,
        existingWebsites: Set<string>,
        existingCompanyNames: Set<string>,
        existingEmails: Set<string>,
        existingLinkedinUrls: Set<string>,
        onLog: LogCallback,
        onComplete: ResultCallback
    ) {
        onLog(`[SKOOL] 🎓 Iniciando búsqueda Skool con Google Dorks...`);

        const targetCount = Math.max(1, config.maxResults || 1);
        const keywords = config.advancedFilters?.keywords?.join(' OR ') || 'coach mentor consultor comunidad';

        const dorkQueries = [
            `site:skool.com/communities`,
            `(${keywords}) AND (comunidad OR alumnos OR transformación OR programa)`,
            `(${keywords}) AND site:instagram.com (comunidad OR coach OR mentor)`,
        ].join('\n');

        onLog(`[SKOOL] 🔍 Queries: ${dorkQueries.substring(0, 100)}...`);

        const validLeads: Lead[] = [];

        try {
            const searchResults = await this.callApifyActor(GOOGLE_SEARCH_SCRAPER, {
                queries: dorkQueries,
                maxPagesPerQuery: 1,
                resultsPerPage: 20,
                languageCode: 'es',
                countryCode: 'es',
            }, onLog);

            onLog(`[SKOOL] 📊 Google retornó ${searchResults.length} resultados`);

            for (const result of searchResults) {
                if (!this.isRunning || validLeads.length >= targetCount) break;

                const organicResults = result.organicResults || [];
                for (const item of organicResults) {
                    if (!this.isRunning || validLeads.length >= targetCount) break;

                    const url: string = item.url || item.link || '';
                    const title: string = item.title || '';
                    const description: string = item.description || item.snippet || '';

                    if (!url || !title) continue;

                    // Extract social links from URL and description
                    const social_links: Record<string, string> = {};
                    if (url.includes('skool.com')) social_links['skool'] = url;
                    if (url.includes('instagram.com')) social_links['instagram'] = url;
                    if (url.includes('linkedin.com')) social_links['linkedin'] = url;

                    const instagramMatch = description.match(/instagram\.com\/[\w.]+/);
                    if (instagramMatch) social_links['instagram'] = `https://${instagramMatch[0]}`;
                    const linkedinMatch = description.match(/linkedin\.com\/in\/[\w-]+/);
                    if (linkedinMatch) social_links['linkedin'] = `https://${linkedinMatch[0]}`;

                    // Build a clean company/creator name
                    const companyName = title.replace(/ \| Skool.*$/, '').replace(/ - .*$/, '').trim() || 'Comunidad Skool';

                    // Deduplicate
                    const cleanName = companyName.toLowerCase();
                    if (existingCompanyNames.has(cleanName)) continue;
                    if (validLeads.some(v => v.companyName.toLowerCase() === cleanName)) continue;

                    const lead: Lead = {
                        id: `skool-${Date.now()}-${validLeads.length}`,
                        source: 'instagram' as const,
                        companyName,
                        website: url,
                        location: '',
                        icp_type: 'skool_creator',
                        social_links,
                        decisionMaker: {
                            name: '',
                            role: 'Fundador / Coach',
                            email: '',
                            phone: '',
                            linkedin: social_links['linkedin'] || '',
                            instagram: social_links['instagram'] || '',
                        },
                        aiAnalysis: {
                            summary: description.substring(0, 200),
                            painPoints: [],
                            generatedIcebreaker: '',
                            fullMessage: '',
                            fullAnalysis: '',
                            psychologicalProfile: '',
                            businessMoment: '',
                            salesAngle: '',
                        },
                        status: 'ready',
                    };

                    validLeads.push(lead);
                    onLog(`[SKOOL] ✅ Lead: ${companyName}`);
                }
            }
        } catch (e: any) {
            onLog(`[SKOOL] ❌ Error en scraping: ${e.message}`);
        }

        if (validLeads.length === 0) {
            onLog(`[SKOOL] ⚠️ No se encontraron leads Skool. Verifica la query o los filtros.`);
            onComplete([]);
            return;
        }

        onLog(`[SKOOL] 🏁 Búsqueda completada: ${validLeads.length} leads Skool encontrados.`);
        onComplete(validLeads);
    }

    private async callApifyActor(actorId: string, input: any, onLog: LogCallback): Promise<any[]> {
        // Use local proxy to avoid CORS
        const baseUrl = '/api/apify';
        const startUrl = `${baseUrl}/acts/${actorId}/runs?token=${this.apiKey}`;

        onLog(`[APIFY] 📡 Lanzando actor ${actorId.substring(0, 8)}...`);
        console.log('[APIFY] POST a:', startUrl.substring(0, 100));

        // STAGE 1: Iniciar actor con timeout
        let startResponse: Response;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                console.error('[APIFY] TIMEOUT en POST /runs (300s)');
            }, 300000); // 300 sec timeout (uncapped)

            startResponse = await fetch(startUrl, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            });
            clearTimeout(timeoutId);
        } catch (networkError: any) {
            console.error('[APIFY] Network error en POST /runs:', networkError.message);
            throw new Error(`Network error llamando Apify (¿proxy /api/apify funciona?): ${networkError.message}`);
        }

        if (!startResponse.ok) {
            const err = await startResponse.text();
            console.error(`[APIFY] HTTP ${startResponse.status}:`, err.substring(0, 300));
            onLog(`[APIFY] ❌ HTTP ${startResponse.status} al lanzar actor`);
            throw new Error(`Error actor ${actorId}: HTTP ${startResponse.status}`);
        }

        let startData: any;
        try {
            startData = await startResponse.json();
        } catch (e: any) {
            console.error('[APIFY] Error parsing JSON response:', e);
            throw new Error('Apify: Invalid JSON response');
        }

        const runId = startData.data?.id;
        const defaultDatasetId = startData.data?.defaultDatasetId;

        if (!runId || !defaultDatasetId) {
            console.error('[APIFY] Missing runId/defaultDatasetId:', { runId, defaultDatasetId });
            throw new Error('Apify: Response missing runId or defaultDatasetId');
        }

        onLog(`[APIFY] ✅ Actor iniciado (${runId.substring(0, 8)})`);
        console.log('[APIFY] Run started. Waiting for completion...');

        // STAGE 2: Poll status con timeout MAX 2 minutos
        let isFinished = false;
        let pollCount = 0;
        const MAX_POLLS = 600; // 600 * 5s = 3000s (uncapped)

        while (!isFinished && this.isRunning && pollCount < MAX_POLLS) {
            await new Promise(r => setTimeout(r, 5000));
            pollCount++;

            try {
                const statusUrl = `${baseUrl}/acts/${actorId}/runs/${runId}?token=${this.apiKey}`;
                const statusRes = await fetch(statusUrl);

                if (!statusRes.ok) {
                    console.error(`[APIFY] Status fetch HTTP ${statusRes.status}`);
                    onLog(`[APIFY] ⚠️ Error obtener status (HTTP ${statusRes.status})`);
                    continue;
                }

                const statusData = await statusRes.json();
                const status = statusData.data?.status;

                if (!status) {
                    console.error('[APIFY] Missing status in response:', statusData);
                    continue;
                }

                if (pollCount % 3 === 1) {
                    console.log(`[APIFY] Poll ${pollCount}/${MAX_POLLS}: ${status}`);
                    onLog(`[APIFY] Estado: ${status} (${pollCount * 5}s)`);
                }

                if (status === 'SUCCEEDED') {
                    isFinished = true;
                    console.log('[APIFY] ✅ SUCCEEDED after', pollCount * 5, 'seconds');
                } else if (status === 'FAILED' || status === 'ABORTED') {
                    console.error('[APIFY] Actor failed/aborted:', status);
                    throw new Error(`Actor ${status}`);
                }
            } catch (pollError: any) {
                console.error('[APIFY] Polling error:', pollError?.message);
                if (pollError.message?.includes('FAILED') || pollError.message?.includes('ABORTED')) {
                    throw pollError;
                }
            }
        }

        if (!isFinished) {
            console.error('[APIFY] TIMEOUT after', MAX_POLLS * 5, 'seconds');
            throw new Error(`Apify timeout: No completó en ${MAX_POLLS * 5}s`);
        }

        if (!this.isRunning) {
            console.log('[APIFY] Search stopped by user');
            return [];
        }

        // STAGE 3: Get dataset
        console.log('[APIFY] Fetching dataset:', defaultDatasetId);
        onLog(`[APIFY] 📥 Descargando dataset...`);

        try {
            const itemsUrl = `${baseUrl}/datasets/${defaultDatasetId}/items?token=${this.apiKey}`;
            const itemsRes = await fetch(itemsUrl);

            if (!itemsRes.ok) {
                console.error(`[APIFY] Dataset HTTP ${itemsRes.status}`);
                throw new Error(`Dataset HTTP ${itemsRes.status}`);
            }

            const items = await itemsRes.json();

            if (!Array.isArray(items)) {
                console.error('[APIFY] Items not array:', typeof items, 'keys:', Object.keys(items || {}).slice(0, 5));
                throw new Error('Dataset response not array');
            }

            console.log('[APIFY] ✅ Got', items.length, 'items');
            onLog(`[APIFY] ✅ Dataset: ${items.length} items`);

            return items;
        } catch (datasetError: any) {
            console.error('[APIFY] Dataset error:', datasetError);
            throw datasetError;
        }
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

            onLog(`[INIT] 🔑 API Key: ${this.apiKey ? '✅ presente (' + this.apiKey.substring(0, 10) + '...)' : '❌ FALTA'}`);
            onLog(`[INIT] 🧠 OpenAI: ✅ API route /api/openai disponible`);
            onLog(`[INIT] 👤 UserId: ${this.userId || 'no autenticado'}`);
            onLog(`[INIT] 🔎 Source: ${config.source} | Query: "${config.query}" | Max: ${config.maxResults}`);

            if (!this.apiKey) throw new Error("Falta VITE_APIFY_API_TOKEN en .env — configúrala en Vercel → Settings → Environment Variables");

            // ═══════════════════════════════════════════════════════════════════════════
            // FASE 1: Pre-Flight - Descargar leads existentes del usuario
            // ═══════════════════════════════════════════════════════════════════════════
            onLog(`[DEDUP] 🔍 Iniciando verificación anti-duplicados...`);
            const { existingWebsites, existingCompanyNames, existingEmails, existingLinkedinUrls } =
                await deduplicationService.fetchExistingLeads(this.userId);
            onLog(`[DEDUP] ✅ Pre-flight: ${existingWebsites.size} dominios, ${existingCompanyNames.size} empresas en historial`);

            // ═══════════════════════════════════════════════════════════════════════════
            // ICP ROUTING — Skool search uses Google Dorks instead of Maps/LinkedIn
            // ═══════════════════════════════════════════════════════════════════════════
            if (config.icp_type === 'skool_creator') {
                onLog(`[ICP] 🎓 Modo Skool detectado — activando Google Dorks`);
                await this.searchSkool(
                    config,
                    existingWebsites,
                    existingCompanyNames,
                    existingEmails,
                    existingLinkedinUrls,
                    onLog,
                    onComplete
                );
                return;
            }

            onLog(`[IA] 🧠 Interpretando: "${config.query}"...`);
            const interpreted = await this.interpretQuery(config.query, config.source);
            onLog(`[IA] ✅ Industria: ${interpreted.industry} | Roles: ${interpreted.targetRoles.join(', ')} | Zona: ${interpreted.location}`);

            if (config.source === 'linkedin') {
                onLog(`[LINKEDIN] 🚀 Iniciando búsqueda LinkedIn...`);
                await this.searchLinkedIn(
                    config,
                    interpreted,
                    existingWebsites,
                    existingCompanyNames,
                    existingEmails,
                    existingLinkedinUrls,
                    onLog,
                    onComplete
                );
            } else {
                onLog(`[GMAIL] 🚀 Iniciando búsqueda Gmail/Maps...`);
                await this.searchGmail(
                    config,
                    interpreted,
                    existingWebsites,
                    existingCompanyNames,
                    existingEmails,
                    existingLinkedinUrls,
                    onLog,
                    onComplete
                );
            }

        } catch (error: any) {
            console.error('[SearchService] FATAL ERROR:', error);
            onLog(`[ERROR] ❌ ${error.message}`);
            onLog(`[ERROR] 📋 Stack: ${error.stack?.split('\n').slice(0, 3).join(' → ') || 'no stack'}`);
            onComplete([]);
        } finally {
            this.isRunning = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════════
    // GMAIL SEARCH - SMART LOOP WITH PAGINATION
    // ═══════════════════════════════════════════════════════════════════════════
    private async searchGmail(
        config: SearchConfigState,
        interpreted: { searchQuery: string; industry: string; targetRoles: string[]; location: string },
        existingWebsites: Set<string>,
        existingCompanyNames: Set<string>,
        existingEmails: Set<string>,
        existingLinkedinUrls: Set<string>,
        onLog: LogCallback,
        onComplete: ResultCallback
    ) {
        console.log('[GMAIL] 🚀 searchGmail iniciado');
        onLog(`[GMAIL] 🚀 Iniciando búsqueda Gmail (Google Search Dorks)...`);

        // Check Hard Limit
        let targetCount = config.maxResults;
        if (!targetCount || targetCount < 1) targetCount = 1;

        // ── Email regex to harvest addresses directly from Google snippets ─────
        const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

        // ── ICP query variants — one call each (maxPagesPerQuery: 1) ──────────
        // Rotating across attempts instead of paying for multi-page Apify runs.
        // Targets social profiles where ICP (Agencias, Skool, Infoproductores)
        // publishes their @gmail in the bio — directly visible in Google snippets.
        const baseQuery = config.advancedFilters
            ? this.buildQueryWithAdvancedFilters(interpreted.searchQuery, config.advancedFilters)
            : interpreted.searchQuery;

        const ICP_QUERY_VARIANTS: string[] = [
            `(site:instagram.com OR site:twitter.com) ("agencia de marketing" OR "marketing digital") "@gmail.com" ${interpreted.location}`,
            `(site:instagram.com OR site:twitter.com OR site:tiktok.com) ("skool" OR "comunidad online" OR "infoproductor") "@gmail.com"`,
            `(site:instagram.com OR site:twitter.com) ("ayudo a" OR "coach" OR "consultor") "@gmail.com" ${interpreted.location}`,
            `(site:instagram.com OR site:twitter.com OR site:tiktok.com) "${baseQuery}" "@gmail.com"`,
            `site:instagram.com ("agencia" OR "fundador" OR "ceo") "@gmail.com" ${interpreted.location}`,
            `site:twitter.com ("growth" OR "director" OR "fundador") ("agencia" OR "skool") "@gmail.com"`,
            `(site:instagram.com OR site:tiktok.com) ("marketing digital" OR "skool" OR "comunidad") "@gmail.com"`,
            `(site:instagram.com OR site:twitter.com) "${baseQuery}" ("founder" OR "ceo") "@gmail.com"`,
        ];

        const validLeads: Lead[] = [];
        let attempts = 0;
        const MAX_ATTEMPTS = ICP_QUERY_VARIANTS.length;

        // ═══════════════════════════════════════════════════════════════════════════
        // SMART LOOP: Rotate ICP query variants — fixed maxPagesPerQuery:1 per call
        // ═══════════════════════════════════════════════════════════════════════════
        while (validLeads.length < targetCount && this.isRunning && attempts < MAX_ATTEMPTS) {
            const activeQuery = ICP_QUERY_VARIANTS[attempts];
            attempts++;

            onLog(`[ATTEMPT ${attempts}] 🔍 Dork: "${activeQuery.substring(0, 90)}..."`);

            // ── Single Google Search Scraper call — 1 page × 20 results ───────
            let organicResults: any[] = [];
            try {
                const searchItems = await this.callApifyActor(GOOGLE_SEARCH_SCRAPER, {
                    queries: activeQuery,
                    maxPagesPerQuery: 1,
                    resultsPerPage: 20,
                    languageCode: 'es',
                    countryCode: 'es',
                }, onLog);
                for (const item of searchItems) {
                    if (item.organicResults) organicResults = organicResults.concat(item.organicResults);
                }
            } catch (e: any) {
                onLog(`[ATTEMPT ${attempts}] ❌ Error en Google Search: ${e.message}`);
                continue;
            }
            onLog(`[ATTEMPT ${attempts}] 📄 ${organicResults.length} resultados orgánicos`);
            if (organicResults.length === 0) continue;

            // ── FAST ICP PRE-FILTER (client-side, zero cost) ──────────────────
            const icpPassed = organicResults.filter((r: any) =>
                this.fastICPFilter(r.title || '', r.description || '', 'gmail')
            );
            onLog(`[ICP] 🎯 ${icpPassed.length}/${organicResults.length} pasaron el filtro ICP`);
            if (icpPassed.length === 0) continue;

            // ── Build provisional Lead objects ────────────────────────────────
            const allLeads: Lead[] = icpPassed.map((result: any, index: number) => {
                const snippetEmails = (result.description || '').match(EMAIL_REGEX) || [];
                const extractedEmail = snippetEmails.length > 0 ? snippetEmails[0] : '';
                return {
                    id: `gmail-${Date.now()}-${attempts}-${index}`,
                    source: 'gmail' as const,
                    companyName: result.title || 'Sin Nombre',
                    website: '',
                    socialUrl: result.url || '',
                    location: interpreted.location,
                    decisionMaker: {
                        name: '',
                        role: 'Decisor',
                        email: extractedEmail,
                        phone: '',
                        linkedin: '',
                        facebook: '',
                        instagram: result.url?.includes('instagram.com') ? result.url : '',
                    },
                    aiAnalysis: {
                        summary: result.description || '',
                        painPoints: [],
                        generatedIcebreaker: '',
                        fullMessage: '',
                        fullAnalysis: '',
                        psychologicalProfile: '',
                        businessMoment: '',
                        salesAngle: ''
                    },
                    status: 'scraped' as const
                };
            });

            // ── Session dedup ─────────────────────────────────────────────────
            const sessionUnique = allLeads.filter(lead =>
                !validLeads.some(v =>
                    (v.socialUrl && v.socialUrl === lead.socialUrl) ||
                    (v.decisionMaker?.email && lead.decisionMaker?.email &&
                        v.decisionMaker.email === lead.decisionMaker.email)
                )
            );
            const withEmailCount = sessionUnique.filter(l => l.decisionMaker?.email).length;
            onLog(`[ATTEMPT ${attempts}] 📊 ${sessionUnique.length} únicos en sesión (${withEmailCount} con email del snippet)`);
            if (sessionUnique.length === 0) continue;

            // ── CONTACT SCRAPER — last resort for ICP Super Leads without email
            const needEmail = sessionUnique.filter(l => !l.decisionMaker?.email && l.socialUrl);
            if (needEmail.length > 0 && this.isRunning) {
                onLog(`[GMAIL] 🔎 Contact Scraper (last resort) para ${needEmail.length} Super Leads sin email...`);
                const BATCH_SIZE = 10;
                const batches = Math.ceil(needEmail.length / BATCH_SIZE);
                for (let i = 0; i < batches && this.isRunning; i++) {
                    const batch = needEmail.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
                    try {
                        const contactResults = await this.callApifyActor(CONTACT_SCRAPER, {
                            startUrls: batch.map(l => ({ url: l.socialUrl })),
                            maxRequestsPerWebsite: 2,
                            sameDomainOnly: false,
                            maxCrawlingDepth: 0,
                        }, () => { });
                        for (const contact of contactResults) {
                            const contactUrl = contact.url || '';
                            const match = batch.find(l =>
                                l.socialUrl && contactUrl.includes(l.socialUrl.split('/').pop() || '')
                            );
                            if (match && contact.emails?.length) {
                                const validEmails = contact.emails.filter((e: string) =>
                                    !e.includes('sentry') && !e.includes('noreply') && !e.includes('wix') && e.includes('@')
                                );
                                if (validEmails.length > 0) {
                                    match.decisionMaker!.email = validEmails[0];
                                    onLog(`[GMAIL] 📧 Email (last resort): ${validEmails[0]}`);
                                }
                            }
                        }
                    } catch (e: any) {
                        onLog(`[GMAIL] ⚠️ Lote Contact Scraper ${i + 1} falló: ${e.message}`);
                    }
                }
            }

            // ── GLOBAL DEDUP ─────────────────────────────────────────────────
            const slotsRemaining = targetCount - validLeads.length;
            const toDedup = sessionUnique.slice(0, slotsRemaining);
            onLog(`[DEDUP] 🎯 Filtrando ${toDedup.length} candidatos contra historial global...`);
            const globalUnique = deduplicationService.filterUniqueCandidates(
                toDedup, existingWebsites, existingCompanyNames, existingEmails, existingLinkedinUrls
            );
            if (globalUnique.length < toDedup.length) {
                onLog(`[DEDUP] ⚠️ ${toDedup.length - globalUnique.length} rechazados (historial). Quedan ${globalUnique.length} nuevos.`);
            }
            if (globalUnique.length === 0) continue;

            for (const lead of globalUnique) {
                validLeads.push(lead);
                onLog(`[SUCCESS] ✅ Lead ${validLeads.length}/${targetCount}: ${lead.companyName}`);
            }
        } // End Smart Loop
        // ─────────────────── (old Maps/Contact Scraper code removed) ──────────
        // eslint-disable-next-line @typescript-eslint/no-unused-vars

        onLog(`[GMAIL] 📊 Búsqueda completada: ${validLeads.length}/${targetCount} en ${attempts} intentos`);

        // Mark all leads as ready
        for (const lead of validLeads) {
            lead.status = 'ready';
        }

        onLog(`[GMAIL] 🏁 FINALIZADO: ${validLeads.length} leads listos`);
        onComplete(validLeads);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LINKEDIN SEARCH - SMART LOOP WITH PAGINATION
    // ═══════════════════════════════════════════════════════════════════════════
    private async searchLinkedIn(
        config: SearchConfigState,
        interpreted: { searchQuery: string; industry: string; targetRoles: string[]; location: string },
        existingWebsites: Set<string>,
        existingCompanyNames: Set<string>,
        existingEmails: Set<string>,
        existingLinkedinUrls: Set<string>,
        onLog: LogCallback,
        onComplete: ResultCallback
    ) {
        console.log('[LINKEDIN] 🚀 searchLinkedIn iniciado');
        onLog(`[LINKEDIN] 🚀 Iniciando búsqueda LinkedIn...`);

        // Check Hard Limit
        let targetCount = config.maxResults;
        if (!targetCount || targetCount < 1) targetCount = 1;
        // if (targetCount > 20) targetCount = 20; // Removed limit

        const validLeads: Lead[] = [];
        let attempts = 0;
        const MAX_ATTEMPTS = 10;
        let currentPage = 1;

        onLog(`[LINKEDIN] 🕵️‍♂️ Target: ${targetCount} leads`);
        console.log('[LINKEDIN] Target count:', targetCount);

        // ═══════════════════════════════════════════════════════════════════════════
        // SMART LOOP: Paginate through results
        // ═══════════════════════════════════════════════════════════════════════════
        while (validLeads.length < targetCount && this.isRunning && attempts < MAX_ATTEMPTS) {
            attempts++;
            const needed = targetCount - validLeads.length;
            const resultsToFetch = needed * 4; // x4 multiplier

            onLog(`[LINKEDIN-ATTEMPT ${attempts}] 🔄 Página ${currentPage}: ${resultsToFetch} resultados...`);

            // Rely solely on the user configuration
            let activeQuery = config.query;
            if (config.advancedFilters) {
                activeQuery = this.buildQueryWithAdvancedFilters(activeQuery, config.advancedFilters);
            }
            activeQuery = `site:linkedin.com/in ${activeQuery}`;

            try {
                const searchResults = await this.callApifyActor(GOOGLE_SEARCH_SCRAPER, {
                    queries: activeQuery,
                    maxPagesPerQuery: 1,      // Hard cap — cheaper; iterate via query variation
                    resultsPerPage: 20,       // Sufficient for one low-cost call
                    languageCode: 'es',
                    countryCode: 'es',
                }, onLog);

                let allResults: any[] = [];
                for (const result of searchResults) {
                    if (result.organicResults) allResults = allResults.concat(result.organicResults);
                }

                if (allResults.length === 0) {
                    onLog(`[LINKEDIN-ATTEMPT ${attempts}] ⚠️ No hay más resultados en página ${currentPage}.`);
                    break;
                }

                const linkedInProfiles = allResults.filter((r: any) => r.url?.includes('linkedin.com/in/'));
                onLog(`[DEBUG] 👤 Perfiles encontrados: ${linkedInProfiles.length}`);

                if (linkedInProfiles.length === 0) {
                    onLog(`[LINKEDIN-ATTEMPT ${attempts}] ⚠️ Sin perfiles en esta página.`);
                    break;
                }

                // Transform raw profiles into provisional Leads
                // FAST ICP PRE-FILTER applied here — discard before dedup + AI (zero cost)
                const provisionalCandidates: Lead[] = [];
                for (let i = 0; i < linkedInProfiles.length; i++) {
                    const profile = linkedInProfiles[i];

                    // Kill non-ICP leads before spending any Apify credits or OpenAI tokens
                    if (!this.fastICPFilter(profile.title || '', profile.description || '', 'linkedin')) {
                        continue;
                    }

                    const titleParts = (profile.title || '').split(' - ');
                    const name = titleParts[0]?.replace(' | LinkedIn', '').trim() || 'Usuario LinkedIn';
                    const role = this.extractRole(profile.title) || 'Decisor';
                    const company = this.extractCompany(profile.title) || 'Empresa Desconocida';

                    provisionalCandidates.push({
                        id: `linkedin-${Date.now()}-${i}`,
                        source: 'linkedin',
                        companyName: company,
                        website: '',
                        location: interpreted.location,
                        decisionMaker: {
                            name,
                            role,
                            email: '',
                            phone: '',
                            linkedin: profile.url
                        },
                        aiAnalysis: {
                            // Store Google snippet as research context — replaces POSTS_SCRAPER at zero cost.
                            // Google snippet almost always contains the headline + initial bio.
                            summary: profile.description || '',
                            fullAnalysis: '',
                            psychologicalProfile: '',
                            businessMoment: '',
                            salesAngle: '',
                            fullMessage: '',
                            generatedIcebreaker: '',
                            painPoints: []
                        },
                        isNPLPotential: false,
                        status: 'scraped'
                    });
                }

                // ═══════════════════════════════════════════════════════════════════════════
                // DEDUPLICATION: Filter against current session & global history BEFORE analysis
                // ═══════════════════════════════════════════════════════════════════════════
                const sessionUnique = provisionalCandidates.filter(candidate =>
                    !validLeads.some(dl => dl.companyName === candidate.companyName || dl.decisionMaker?.linkedin === candidate.decisionMaker?.linkedin)
                );

                let globalUnique: Lead[] = [];
                if (sessionUnique.length > 0) {
                    onLog(`[DEDUP] 🎯 Filtrando ${sessionUnique.length} candidatos LinkedIn contra historial global...`);
                    globalUnique = deduplicationService.filterUniqueCandidates(
                        sessionUnique,
                        existingWebsites,
                        existingCompanyNames,
                        existingEmails,
                        existingLinkedinUrls
                    );

                    if (globalUnique.length < sessionUnique.length) {
                        onLog(
                            `[DEDUP] ⚠️ ${sessionUnique.length - globalUnique.length} duplicados descartados. ` +
                            `Quedan ${globalUnique.length} nuevos por procesar.`
                        );
                    }
                }

                if (globalUnique.length === 0) {
                    onLog(`[LINKEDIN-ATTEMPT ${attempts}] ℹ️ Todos los candidatos de esta página ya existen en historial.`);
                    currentPage++;
                    continue;
                }

                // Slice the results exactly to what we need
                const remainingSlots = targetCount - validLeads.length;
                const candidatesToProcess = globalUnique.slice(0, remainingSlots);

                onLog(`[INFO] Procesando ${candidatesToProcess.length} leads únicos (saltando el resto para respetar target: ${targetCount}).`);

                const prevCount = validLeads.length;
                const processCount = Math.min(candidatesToProcess.length, targetCount - prevCount);
                if (processCount <= 0) break;

                const candidatesBatch = candidatesToProcess.slice(0, processCount);

                for (const candidate of candidatesBatch) {
                    if (!this.isRunning) break;
                    candidate.status = 'ready';
                    validLeads.push(candidate);
                    onLog(`[SUCCESS] ✅ Lead ${validLeads.length}/${targetCount}: ${candidate.companyName}`);
                }

                currentPage++;

            } catch (error: any) {
                onLog(`[LINKEDIN-ATTEMPT ${attempts}] ❌ Error: ${error.message}`);
                break;
            }
        } // End Smart Loop

        onLog(`[LINKEDIN] 🏁 Búsqueda completada: ${validLeads.length}/${targetCount} en ${attempts} intentos`);
        onComplete(validLeads);
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

    // ═══════════════════════════════════════════════════════════════════════════
    // FAST ICP PRE-FILTER — Client-side regex gate, runs BEFORE dedup and AI
    // Eliminates non-ICP leads without spending a single Apify credit or OpenAI token.
    // Returns true  → lead matches ICP, proceed normally.
    // Returns false → discard immediately, skip dedup + analysis.
    // ═══════════════════════════════════════════════════════════════════════════
    private fastICPFilter(title: string, description: string, _icpType: string): boolean {
        const corpus = `${title} ${description}`.toLowerCase();

        // ── Negative gate (hard stop) ──────────────────────────────────────────
        const NEGATIVE_REGEX = /\b(junior|intern|estudiante|freelance|buscando nuevas oportunidades|profesor)\b/i;
        if (NEGATIVE_REGEX.test(corpus)) return false;

        // ── Positive gate (must match at least one) ────────────────────────────
        const POSITIVE_REGEX = /\b(founder|ceo|director|agencia|marketing|skool|comunidad|ayudo a|growth)\b/i;
        return POSITIVE_REGEX.test(corpus);
    }
}

export const searchService = new SearchService();
