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
    // QUERY MULTIPLIER
    // Generates N location-scoped Google dork variations from a single keyword.
    // Bypasses Google's ~300-result cap by spreading across locations/sub-titles.
    // ═══════════════════════════════════════════════════════════════════════════
    private generateQueryVariations(
        baseKeyword: string,
        icpType: 'agency' | 'skool_creator' | 'other'
    ): string[] {
        if (icpType === 'skool_creator') {
            return [
                `site:skool.com/about "${baseKeyword}"`,
                `site:skool.com/about coach mentor España`,
                `site:skool.com/about comunidad online España`,
                `site:skool.com/about high-ticket coach Spain`,
                `site:skool.com/about infoproductor programa`,
            ];
        }

        if (icpType === 'agency') {
            const LOCATIONS = [
                'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao',
                'Zaragoza', 'Málaga', 'Alicante', 'México', 'Colombia', 'Miami', 'remoto',
            ];
            const baseDork =
                `(site:linkedin.com/in/ OR site:linkedin.com/pub/) -inurl:dir -inurl:jobs ` +
                `("CEO" OR "Founder" OR "Fundador" OR "Director" OR "Propietario" OR "Owner") ` +
                `"${baseKeyword}"`;
            return LOCATIONS.map(loc => `${baseDork} "${loc}"`);
        }

        // Fallback for 'other'
        return [`site:linkedin.com/in/ "${baseKeyword}" ("CEO" OR "Founder" OR "Director")`];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SNIPPET PARSER — Pure TypeScript/Regex. Zero AI.
    // Extracts FirstName, LastName, Role, Company from raw Google title/snippet.
    // ═══════════════════════════════════════════════════════════════════════════
    private parseSnippetData(
        title: string,
        _description: string,
        url: string
    ): { firstName: string; lastName: string; fullName: string; role: string; company: string } {
        // ── Skool page: "Community Name - Skool" ─────────────────────────────
        if (url.includes('skool.com')) {
            const community = title.replace(/\s*[-–]\s*Skool\s*$/i, '').trim();
            return { firstName: '', lastName: '', fullName: '', role: 'Fundador / Coach', company: community };
        }

        // ── LinkedIn profile: "Nombre Apellido - Cargo - Empresa | LinkedIn" ─
        // 1. Strip " | LinkedIn" suffix
        const cleanTitle = title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();

        // 2. Split on " - " delimiters
        const parts = cleanTitle.split(/\s*[-–]\s*/);

        // Part[0] → full name
        const rawName = (parts[0] || '').trim();
        const nameTokens = rawName.split(/\s+/);
        const firstName = nameTokens[0] || '';
        const lastName = nameTokens.slice(1).join(' ');

        // Part[1] → role/headline
        const role = (parts[1] || '').trim();

        // Part[2] → company (optional)
        const company = (parts[2] || '').trim();

        return {
            firstName,
            lastName,
            fullName: rawName,
            role: role || this.extractRole(title) || 'Decisor',
            company: company || this.extractCompany(title) || 'Empresa Desconocida',
        };
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
    // SKOOL SEARCH — Concurrent dorks on site:skool.com/about via Promise.all
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
        onLog(`[SKOOL] 🎓 Iniciando búsqueda Skool con Query Multiplier (site:skool.com/about)...`);

        const targetCount = Math.max(1, config.maxResults || 1);
        const baseKeyword = config.advancedFilters?.keywords?.join(' ') || config.query || 'coach comunidad online';
        const variations = this.generateQueryVariations(baseKeyword, 'skool_creator');

        onLog(`[SKOOL] 🔀 ${variations.length} variaciones generadas — ejecutando en paralelo...`);

        const startTime = Date.now();
        const MAX_DURATION_MS = 38 * 60 * 1000;

        // Execute all Skool variations concurrently (few queries, safe in one batch)
        let allOrganicResults: any[] = [];
        try {
            const batchResults = await Promise.all(
                variations.map(q =>
                    this.callApifyActor(GOOGLE_SEARCH_SCRAPER, {
                        queries: q,
                        maxPagesPerQuery: 1,
                        resultsPerPage: 20,
                        languageCode: 'es',
                        countryCode: 'es',
                    }, onLog).catch((e: Error) => {
                        onLog(`[SKOOL] ⚠️ Variación falló: ${e.message}`);
                        return [] as any[];
                    })
                )
            );
            for (const items of batchResults) {
                for (const item of items) {
                    if (item.organicResults) allOrganicResults = allOrganicResults.concat(item.organicResults);
                }
            }
        } catch (e: any) {
            onLog(`[SKOOL] ❌ Error en batch concurrente: ${e.message}`);
        }

        onLog(`[SKOOL] 📊 Total resultados crudos: ${allOrganicResults.length}`);

        const validLeads: Lead[] = [];
        for (const item of allOrganicResults) {
            if (!this.isRunning || validLeads.length >= targetCount) break;
            if (Date.now() - startTime > MAX_DURATION_MS) break;

            const url: string = item.url || item.link || '';
            const title: string = item.title || '';
            const description: string = item.description || item.snippet || '';

            if (!url || !title) continue;

            // URL strict filter: must be skool.com
            if (!url.includes('skool.com')) continue;

            // Apply fast ICP filter
            if (!this.fastICPFilter(title, description, 'skool_creator', url)) continue;

            // Parse snippet data — strips " - Skool" from title
            const parsed = this.parseSnippetData(title, description, url);
            const communityName = parsed.company || 'Comunidad Skool';

            // Build social links
            const social_links: Record<string, string> = {};
            social_links['skool'] = url;
            const instagramMatch = description.match(/instagram\.com\/[\w.]+/);
            if (instagramMatch) social_links['instagram'] = `https://${instagramMatch[0]}`;
            const linkedinMatch = description.match(/linkedin\.com\/in\/[\w-]+/);
            if (linkedinMatch) social_links['linkedin'] = `https://${linkedinMatch[0]}`;

            // Session dedup
            const cleanName = communityName.toLowerCase();
            if (existingCompanyNames.has(cleanName)) continue;
            if (validLeads.some(v => v.companyName.toLowerCase() === cleanName)) continue;

            const lead: Lead = {
                id: `skool-${Date.now()}-${validLeads.length}`,
                source: 'instagram' as const,
                companyName: communityName,
                website: url,
                location: '',
                icp_type: 'skool_creator',
                social_links,
                decisionMaker: {
                    name: parsed.fullName,
                    role: parsed.role,
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
                messageA: undefined,
                status: 'ready',
            };

            validLeads.push(lead);
            onLog(`[SKOOL] ✅ Lead ${validLeads.length}/${targetCount}: ${communityName}`);
        }

        if (validLeads.length === 0) {
            onLog(`[SKOOL] ⚠️ No se encontraron leads Skool. Verifica la query o los filtros.`);
            onComplete([]);
            return;
        }

        // Global dedup pass
        const deduped = deduplicationService.filterUniqueCandidates(
            validLeads, existingWebsites, existingCompanyNames, existingEmails, existingLinkedinUrls
        );

        onLog(`[SKOOL] 🏁 ${deduped.length}/${targetCount} leads Skool únicos encontrados`);
        onComplete(deduped.slice(0, targetCount));
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
            onLog(`[INIT] 🚫 Modo Zero-AI: activo — sin OpenAI, parseo puro TypeScript/Regex`);
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

            if (config.source === 'linkedin') {
                onLog(`[LINKEDIN] 🚀 Iniciando búsqueda LinkedIn con Query Multiplier (Zero-AI)...`);
                await this.searchLinkedIn(
                    config,
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
            ? this.buildQueryWithAdvancedFilters(config.query, config.advancedFilters)
            : config.query;

        const ICP_QUERY_VARIANTS: string[] = [
            `(site:instagram.com OR site:twitter.com) ("agencia de marketing" OR "marketing digital") "@gmail.com" ("España" OR "Madrid" OR "Barcelona")`,
            `(site:instagram.com OR site:twitter.com OR site:tiktok.com) ("skool" OR "comunidad online" OR "infoproductor") "@gmail.com" ("España" OR "Spain")`,
            `(site:instagram.com OR site:twitter.com) ("ayudo a" OR "coach" OR "consultor") "@gmail.com" ("España" OR "Madrid" OR "Barcelona")`,
            `(site:instagram.com OR site:twitter.com OR site:tiktok.com) "${baseQuery}" "@gmail.com" ("España" OR "Spain")`,
            `site:instagram.com ("agencia" OR "fundador" OR "ceo") "@gmail.com" ("España" OR "Madrid" OR "Barcelona")`,
            `site:twitter.com ("growth" OR "director" OR "fundador") ("agencia" OR "skool") "@gmail.com" "España"`,
            `(site:instagram.com OR site:tiktok.com) ("marketing digital" OR "skool" OR "comunidad") "@gmail.com" "España"`,
            `(site:instagram.com OR site:twitter.com) "${baseQuery}" ("founder" OR "ceo") "@gmail.com" "España"`,
        ];

        const validLeads: Lead[] = [];
        let attempts = 0;
        const MAX_ATTEMPTS = Math.min(30, Math.max(ICP_QUERY_VARIANTS.length, targetCount * 4));
        const startTime = Date.now();
        const MAX_DURATION_MS = 38 * 60 * 1000;

        // ═══════════════════════════════════════════════════════════════════════════
        // SMART LOOP: Rotate ICP query variants — cycles with startPage offsets when exhausted
        // ═══════════════════════════════════════════════════════════════════════════
        while (validLeads.length < targetCount && this.isRunning && attempts < MAX_ATTEMPTS) {
            if (Date.now() - startTime > MAX_DURATION_MS) {
                onLog(`[GMAIL] ⏱️ Tiempo máximo alcanzado. ${validLeads.length}/${targetCount} leads encontrados.`);
                break;
            }
            const variantIndex = attempts % ICP_QUERY_VARIANTS.length;
            const cycleNum = Math.floor(attempts / ICP_QUERY_VARIANTS.length);
            const activeQuery = cycleNum === 0
                ? ICP_QUERY_VARIANTS[variantIndex]
                : this.buildFallbackGmailQuery(ICP_QUERY_VARIANTS[variantIndex], 'España', cycleNum);
            attempts++;

            onLog(`[ATTEMPT ${attempts}] 🔍 Dork: "${activeQuery.substring(0, 90)}..."`);

            // ── Single Google Search Scraper call — 1 page × 20 results ───────
            let organicResults: any[] = [];
            try {
                const cycleNum = Math.floor((attempts - 1) / ICP_QUERY_VARIANTS.length);
                const searchItems = await this.callApifyActor(GOOGLE_SEARCH_SCRAPER, {
                    queries: activeQuery,
                    maxPagesPerQuery: 1,
                    startPage: cycleNum,
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
                    location: 'España',
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

        onLog(`[GMAIL] 📊 Búsqueda completada: ${validLeads.length}/${targetCount} en ${attempts} intentos (${Math.round((Date.now() - startTime) / 1000)}s)`);

        // Mark all leads as ready
        for (const lead of validLeads) {
            lead.status = 'ready';
        }

        onLog(`[GMAIL] 🏁 FINALIZADO: ${validLeads.length} leads listos`);
        onComplete(validLeads);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LINKEDIN SEARCH — Query Multiplier + Concurrent Apify + Zero-AI Parsing
    // ═══════════════════════════════════════════════════════════════════════════
    private async searchLinkedIn(
        config: SearchConfigState,
        existingWebsites: Set<string>,
        existingCompanyNames: Set<string>,
        existingEmails: Set<string>,
        existingLinkedinUrls: Set<string>,
        onLog: LogCallback,
        onComplete: ResultCallback
    ) {
        console.log('[LINKEDIN] 🚀 searchLinkedIn iniciado (Query Multiplier)');
        onLog(`[LINKEDIN] 🚀 Iniciando búsqueda LinkedIn con Google X-Ray Search...`);

        const targetCount = Math.max(1, config.maxResults || 1);
        const icpType = config.icp_type || 'agency';
        const baseKeyword = config.advancedFilters
            ? this.buildQueryWithAdvancedFilters(config.query, config.advancedFilters)
            : config.query;

        // Generate N location-scoped dork variations — one per location
        const variations = this.generateQueryVariations(baseKeyword, icpType);
        onLog(`[LINKEDIN] 🔀 ${variations.length} variaciones de query generadas (una por ubicación)`);

        const validLeads: Lead[] = [];
        const startTime = Date.now();
        const MAX_DURATION_MS = 38 * 60 * 1000;
        const BATCH_SIZE = 5;

        // Process variations in batches of BATCH_SIZE to avoid Apify rate limits
        for (let batchStart = 0; batchStart < variations.length; batchStart += BATCH_SIZE) {
            if (!this.isRunning || validLeads.length >= targetCount) break;
            if (Date.now() - startTime > MAX_DURATION_MS) {
                onLog(`[LINKEDIN] ⏱️ Tiempo máximo alcanzado. ${validLeads.length}/${targetCount} leads encontrados.`);
                break;
            }

            const batchVariations = variations.slice(batchStart, batchStart + BATCH_SIZE);
            const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(variations.length / BATCH_SIZE);
            onLog(`[LINKEDIN] 📦 Lote ${batchNum}/${totalBatches}: ${batchVariations.length} queries concurrentes...`);

            // Execute batch concurrently
            let batchOrganicResults: any[] = [];
            try {
                const batchResults = await Promise.all(
                    batchVariations.map(q =>
                        this.callApifyActor(GOOGLE_SEARCH_SCRAPER, {
                            queries: q,
                            maxPagesPerQuery: 1,
                            resultsPerPage: 20,
                            languageCode: 'es',
                            countryCode: 'es',
                        }, onLog).catch((e: Error) => {
                            onLog(`[LINKEDIN] ⚠️ Variación falló: ${e.message}`);
                            return [] as any[];
                        })
                    )
                );
                for (const items of batchResults) {
                    for (const item of items) {
                        if (item.organicResults) {
                            batchOrganicResults = batchOrganicResults.concat(item.organicResults);
                        }
                    }
                }
            } catch (e: any) {
                onLog(`[LINKEDIN] ❌ Error en lote ${batchNum}: ${e.message}`);
                continue;
            }

            onLog(`[LINKEDIN] 📊 Lote ${batchNum}: ${batchOrganicResults.length} resultados crudos`);

            // ── FAST ICP PRE-FILTER (URL + regex, zero cost) ──────────────────
            const icpPassed = batchOrganicResults.filter((r: any) =>
                this.fastICPFilter(r.title || '', r.description || '', icpType, r.url || r.link || '')
            );
            onLog(`[ICP] 🎯 ${icpPassed.length}/${batchOrganicResults.length} pasaron el filtro ICP`);

            // ── PARSE + MAP to Lead objects (Zero-AI) ─────────────────────────
            const provisionalCandidates: Lead[] = [];
            for (let i = 0; i < icpPassed.length; i++) {
                const result = icpPassed[i];
                const url: string = result.url || result.link || '';
                const title: string = result.title || '';
                const description: string = result.description || result.snippet || '';

                // Must be a personal LinkedIn profile
                if (!url.includes('linkedin.com/in/')) continue;

                const parsed = this.parseSnippetData(title, description, url);

                provisionalCandidates.push({
                    id: `linkedin-${Date.now()}-${batchStart}-${i}`,
                    source: 'linkedin' as const,
                    companyName: parsed.company || 'Empresa Desconocida',
                    website: '',
                    location: 'España',
                    icp_type: icpType,
                    decisionMaker: {
                        name: parsed.fullName || 'Usuario LinkedIn',
                        role: parsed.role,
                        email: '',
                        phone: '',
                        linkedin: url,
                    },
                    aiAnalysis: {
                        summary: description.substring(0, 300),
                        painPoints: [],
                        generatedIcebreaker: '',
                        fullMessage: '',
                        fullAnalysis: '',
                        psychologicalProfile: '',
                        businessMoment: '',
                        salesAngle: '',
                    },
                    messageA: undefined,
                    isNPLPotential: false,
                    status: 'scraped' as const,
                });
            }

            // ── SESSION DEDUP ─────────────────────────────────────────────────
            const sessionUnique = provisionalCandidates.filter(candidate =>
                !validLeads.some(dl =>
                    dl.decisionMaker?.linkedin === candidate.decisionMaker?.linkedin ||
                    (dl.companyName === candidate.companyName && dl.companyName !== 'Empresa Desconocida')
                )
            );

            if (sessionUnique.length === 0) {
                onLog(`[LINKEDIN] ℹ️ Todos los candidatos del lote ${batchNum} ya existen en historial.`);
                continue;
            }

            // ── GLOBAL DEDUP against DB history ──────────────────────────────
            onLog(`[DEDUP] 🎯 Filtrando ${sessionUnique.length} candidatos contra historial global...`);
            const slotsRemaining = targetCount - validLeads.length;
            const toDedup = sessionUnique.slice(0, slotsRemaining * 2); // x2 buffer
            const globalUnique = deduplicationService.filterUniqueCandidates(
                toDedup, existingWebsites, existingCompanyNames, existingEmails, existingLinkedinUrls
            );

            if (globalUnique.length < toDedup.length) {
                onLog(`[DEDUP] ⚠️ ${toDedup.length - globalUnique.length} duplicados descartados. Quedan ${globalUnique.length} nuevos.`);
            }

            // ── ACCEPT leads respecting targetCount cap ────────────────────────
            for (const lead of globalUnique) {
                if (!this.isRunning || validLeads.length >= targetCount) break;
                lead.status = 'ready';
                validLeads.push(lead);
                // Register in in-memory sets for within-session dedup
                if (lead.decisionMaker?.linkedin) {
                    existingLinkedinUrls.add(lead.decisionMaker.linkedin.toLowerCase().trim());
                }
                onLog(`[SUCCESS] ✅ Lead ${validLeads.length}/${targetCount}: ${lead.decisionMaker?.name || lead.companyName}`);
            }
        } // end batch loop

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        onLog(`[LINKEDIN] 🏁 Búsqueda completada: ${validLeads.length}/${targetCount} en ${elapsed}s`);
        onComplete(validLeads);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK GMAIL QUERY BUILDER — cycles exhausted variants with page/country offsets
    // ═══════════════════════════════════════════════════════════════════════════
    private buildFallbackGmailQuery(baseVariant: string, location: string, cycleNum: number): string {
        // Rotate through Spanish cities to get different Google result pages — always stays in Spain
        const SPAIN_CITIES = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao', 'España'];
        const city = SPAIN_CITIES[(cycleNum - 1) % SPAIN_CITIES.length];
        if (baseVariant.includes(location)) {
            return baseVariant.replace(location, `"${city}"`);
        }
        return `${baseVariant} "${city}"`;
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
    // Returns false → discard immediately.
    // ═══════════════════════════════════════════════════════════════════════════
    private fastICPFilter(title: string, description: string, _icpType: string, url?: string): boolean {
        // ── URL type gate — reject company pages, posts, and job listings ─────
        if (url) {
            if (/linkedin\.com\/(company|posts|jobs)\//i.test(url)) return false;
        }

        const corpus = `${title} ${description}`.toLowerCase();

        // ── Spain gate — must show a Spain location signal in the snippet ──────
        // LinkedIn snippets almost always include the region line; Gmail dorks
        // already inject "España" in the query so it appears in results too.
        const SPAIN_REGEX = /\b(espa[nñ]a|spain|madrid|barcelona|valencia|sevilla|bilbao|zaragoza|m[aá]laga|murcia|alicante|granada|vigo|c[oó]rdoba|canarias|galicia|andaluc[ií]a|euskadi|catalu[nñ]a|castilla|burgos|salamanca|valladolid|c[aá]diz|huelva|ja[eé]n|almer[ií]a|badajoz|c[aá]ceres|toledo|albacete|ciudad real|cuenca|guadalajara|le[oó]n|palencia|segovia|soria|zamora|[aá]vila|la rioja|navarra|asturias|cantabria|murcia|extremadura|baleares|canarias|pa[ií]s vasco)\b/i;
        if (!SPAIN_REGEX.test(corpus)) return false;

        // ── Negative gate (hard stop) ──────────────────────────────────────────
        const NEGATIVE_REGEX = /\b(junior|intern(a)?|estudiante|dise[nñ]ador|dise[nñ]o gr[aá]fico|freelance|buscando nuevas oportunidades|buscando empleo|open to work|en b[uú]squeda activa|profesor)\b/i;
        if (NEGATIVE_REGEX.test(corpus)) return false;

        // ── Positive gate (must match at least one) ────────────────────────────
        const POSITIVE_REGEX = /\b(founder|ceo|director|agencia|marketing|skool|comunidad|ayudo a|growth)\b/i;
        return POSITIVE_REGEX.test(corpus);
    }
}

export const searchService = new SearchService();
