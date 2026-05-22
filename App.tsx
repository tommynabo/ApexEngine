import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SearchConfig } from './components/SearchConfig';
import { SearchCriteriaModal } from './components/SearchCriteriaModal';
import { AgentTerminal } from './components/AgentTerminal';
import { LeadsTable } from './components/LeadsTable';
import { MessageModal } from './components/MessageModal';
import { LoginPage } from './components/LoginPage';
import { CampaignsView } from './components/CampaignsView';
import { HistoryModal } from './components/HistoryModal';
import { CampaignHub } from './components/CampaignHub';
import { CampaignWorkspace } from './components/CampaignWorkspace';
import { ICP_PRESETS, IcpPreset } from './lib/searchFilterData';
import { Lead, SearchConfigState, PageView, SearchSession } from './lib/types';
import { PROJECT_CONFIG } from './config/project';
import { searchService } from './services/search/SearchService';
import { supabase } from './lib/supabase';

function App() {
  // Navigation & Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<PageView>('login');

  // Search State
  const [config, setConfig] = useState<SearchConfigState>({
    query: '("Emprendedor digital" OR "Infoproductor" OR "Coach High Ticket" OR "Consultor" OR "Dueño") AND ("CEO" OR "Fundador" OR "Propietario")',
    source: 'linkedin',
    mode: 'fast',
    maxResults: 1
  });

  const [isSearching, setIsSearching] = useState(false);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [terminalExpanded, setTerminalExpanded] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // History State
  const [history, setHistory] = useState<SearchSession[]>([]);
  const [selectedHistorySession, setSelectedHistorySession] = useState<SearchSession | null>(null);
  const [totalLeadsGenerated, setTotalLeadsGenerated] = useState(0);

  // Campaign Navigation
  const [activeCampaignId, setActiveCampaignId] = useState<'skool_creator' | 'agency' | null>(null);

  // Modal State
  const [isCriteriaModalOpen, setIsCriteriaModalOpen] = useState(false);

  // Sound Effect
  const playGlassSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1100, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1600, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 1.5);
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  // Check Session on Mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsAuthenticated(true);
        setUserId(session.user.id);
        setCurrentPage('dashboard');
        loadProfile(session.user.id);
        loadHistory(session.user.id);
      }
    });

    return () => {
      searchService.stop();
    };
  }, []);

  const loadProfile = async (uid: string) => {
    try {
      // First, get user email from auth session
      const { data: { session } } = await supabase.auth.getSession();
      const userEmail = session?.user?.email || '';

      // DEFENSIVE: Ensure profile exists (upsert)
      // This fixes the case where the user was created BEFORE the trigger existed
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({
          id: uid,
          email: userEmail,
          full_name: userEmail.split('@')[0], // fallback name from email
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (upsertError) {
        console.warn('[Profile] Upsert warning:', upsertError.message);
      }

      // Now load the profile
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', uid)
        .single();

      if (data) {
        if (data.full_name) {
          setUserName(data.full_name);
        }
      }
    } catch (e) {
      console.error('Error loading profile', e);
    }
  };

  const loadHistory = async (uid: string) => {
    try {
      // Load search history first
      const { data: searchData, error: searchError } = await supabase
        .from('search_history')
        .select('*')
        .eq('user_id', uid)
        .order('executed_at', { ascending: false });

      if (searchError) {
        console.error('DB Error loading history:', searchError);
        addLog(`[DB] ⚠️ Error cargando historial: ${searchError.message}`);
        return;
      }

      if (searchData && searchData.length > 0) {
        // For each search session, load associated leads
        const sessions: SearchSession[] = await Promise.all(
          searchData.map(async (row) => {
            // Load leads for this search session
            const { data: leadsData, error: leadsError } = await supabase
              .from('leads')
              .select('*')
              .eq('search_id', row.id);

            let leads: Lead[] = [];
            if (leadsError) {
              console.warn(`[HISTORY] Error loading leads for session ${row.id}:`, leadsError);
            } else if (leadsData && leadsData.length > 0) {
              // Transform DB leads to Lead interface
              leads = leadsData.map(l => ({
                id: l.id,
                source: (l.source || row.source || 'linkedin') as any,
                companyName: l.company_name || 'Sin Nombre',
                website: l.website,
                location: l.location,
                decisionMaker: l.decision_maker ? {
                  name: l.decision_maker.name || '',
                  role: l.decision_maker.role || '',
                  email: l.decision_maker.email || '',
                  phone: l.decision_maker.phone,
                  linkedin: l.decision_maker.linkedin,
                  facebook: l.decision_maker.facebook,
                  instagram: l.decision_maker.instagram
                } : undefined,
                aiAnalysis: {
                  summary: l.ai_analysis?.summary || '',
                  painPoints: l.ai_analysis?.painPoints || [],
                  generatedIcebreaker: l.ai_analysis?.generatedIcebreaker || '',
                  fullMessage: l.ai_analysis?.fullMessage || '',
                  fullAnalysis: l.ai_analysis?.fullAnalysis || l.ai_analysis?.summary || '',
                  psychologicalProfile: l.ai_analysis?.psychologicalProfile || '',
                  businessMoment: l.ai_analysis?.businessMoment || '',
                  salesAngle: l.ai_analysis?.salesAngle || ''
                },
                messageA: l.message_a,
                isNPLPotential: l.is_npl_potential || false,
                status: (l.status || 'scraped') as any,
                icp_type: l.icp_type as any
              }));
            }

            return {
              id: row.id,
              date: new Date(row.executed_at),
              query: row.query || '',
              source: (row.source || 'linkedin') as any,
              resultsCount: leads.length || row.results_count || 0,
              leads: leads,
              icp_type: (row.icp_type as any) || ICP_PRESETS.find(p => p.query === row.query)?.id,
            };
          })
        );

        setHistory(sessions);
        const leadsSum = sessions.reduce((sum, s) => sum + s.leads.length, 0);
        setTotalLeadsGenerated(leadsSum);
        console.log(`[HISTORY] Cargadas ${sessions.length} búsquedas con ${leadsSum} leads del cloud`);
      }
    } catch (e) {
      console.error('Error loading history', e);
    }
  };

  // Auth Handlers
  const handleLogin = () => {
    // Called after successful Supabase login
    setIsAuthenticated(true);
    setCurrentPage('dashboard');
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserId(session.user.id);
        loadProfile(session.user.id);
        loadHistory(session.user.id);
      }
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setUserId(null);
    setUserName('');
    setCurrentPage('login');
    setLogs([]);
    setLeads([]);
    setTerminalVisible(false);
    searchService.stop();
  };

  const addLog = (message: string) => {
    setLogs(prev => [...prev, message]);
  };

  // Search Logic
  const handleSearch = () => {
    if (!config.query) return;

    setIsSearching(true);
    setTerminalVisible(true);
    setTerminalExpanded(true);
    setLogs([]);
    setLeads([]);

    searchService.startSearch(
      config,
      // onLog
      (message) => addLog(message),
      // onComplete
      async (results) => {
        setIsSearching(false);
        setLeads(results);

        // Add to history (Local)
        const newSession: SearchSession = {
          id: Date.now().toString(),
          date: new Date(),
          query: config.query,
          source: config.source,
          resultsCount: results.length,
          leads: results,
          icp_type: config.icp_type,
        };
        setHistory(prev => [newSession, ...prev]);
        setTotalLeadsGenerated(prev => prev + results.length);

        // Save to Supabase (Cloud)
        if (userId) {
          try {
            // 1. Insert search record and get ID
            const { data, error: searchError } = await supabase
              .from('search_history')
              .insert({
                user_id: userId,
                query: config.query,
                source: config.source,
                mode: config.mode,
                max_results: config.maxResults,
                results_count: results.length,
                icp_type: config.icp_type || null,
                executed_at: new Date().toISOString()
              })
              .select();

            if (searchError) {
              console.error('DB Error saving search_history:', searchError);
              addLog(`[DB] ⚠️ Error al guardar búsqueda: ${searchError.message}`);
              return;
            }

            if (!data || data.length === 0) {
              addLog(`[DB] ⚠️ No se obtuvo ID de búsqueda.`);
              return;
            }

            const searchId = data[0].id;
            addLog(`[DB] ✅ Búsqueda registrada (ID: ${searchId})`);

            // 2. Save each lead to the leads table with search_id reference
            const leadsToInsert = results.map(lead => ({
              user_id: userId,
              search_id: searchId,
              source: lead.source || config.source,
              company_name: lead.companyName || '',
              website: lead.website || null,
              location: lead.location || null,
              decision_maker: lead.decisionMaker ? {
                name: lead.decisionMaker.name,
                role: lead.decisionMaker.role,
                email: lead.decisionMaker.email,
                phone: lead.decisionMaker.phone || null,
                linkedin: lead.decisionMaker.linkedin || null,
                facebook: lead.decisionMaker.facebook || null,
                instagram: lead.decisionMaker.instagram || null
              } : null,
              ai_analysis: {
                summary: lead.aiAnalysis?.summary || '',
                painPoints: lead.aiAnalysis?.painPoints || [],
                generatedIcebreaker: lead.aiAnalysis?.generatedIcebreaker || '',
                fullMessage: lead.aiAnalysis?.fullMessage || '',
                fullAnalysis: lead.aiAnalysis?.fullAnalysis || '',
                psychologicalProfile: lead.aiAnalysis?.psychologicalProfile || '',
                businessMoment: lead.aiAnalysis?.businessMoment || '',
                salesAngle: lead.aiAnalysis?.salesAngle || ''
              },
              message_a: lead.messageA || null,
              is_npl_potential: lead.isNPLPotential || false,
              icp_type: lead.icp_type || config.icp_type || null,
              status: lead.status || 'scraped'
            }));

            const { error: leadsError } = await supabase
              .from('leads')
              .insert(leadsToInsert);

            if (leadsError) {
              console.error('DB Error saving leads:', leadsError);
              addLog(`[DB] ⚠️ Error al guardar ${results.length} contactos: ${leadsError.message}`);
            } else {
              addLog(`[DB] ✅ ${results.length} contactos guardados correctamente.`);
            }
          } catch (err) {
            console.error('Failed to save results to DB', err);
            addLog(`[ERROR] Excepción al guardar: ${err}`);
          }
        } else {
          addLog('[⚠️] No se guardó en la nube (usuario no autenticado).');
        }

        playGlassSound();
        setTimeout(() => setTerminalExpanded(false), 1500);
      },
      // userId para deduplicación
      userId
    );
  };

  const handleStop = () => {
    if (isSearching) {
      searchService.stop();
      setIsSearching(false);
      setTerminalExpanded(false);
      addLog('[USUARIO] 🛑 Generación detenida manualmente.');
    }
  };

  const handleConfigChange = (updates: Partial<SearchConfigState>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const handleOpenCriteria = () => {
    setIsCriteriaModalOpen(true);
  };

  const handleSaveCriteria = (newQuery: string, filters?: any, icp_type?: 'agency' | 'skool_creator' | 'other') => {
    setConfig(prev => ({
      ...prev,
      query: newQuery,
      advancedFilters: filters,
      icp_type: icp_type ?? prev.icp_type,
    }));
    setIsCriteriaModalOpen(false);
  };

  const handleViewSessionResults = (session: SearchSession) => {
    setSelectedHistorySession(session);
  };

  const handleEnterCampaign = (preset: IcpPreset) => {
    setActiveCampaignId(preset.id);
    setLeads([]);
    setLogs([]);
    setTerminalVisible(false);
    setConfig(prev => ({
      ...prev,
      query: preset.query,
      icp_type: preset.id,
      advancedFilters: {
        locations: [],
        jobTitles: preset.jobTitles,
        companySizes: [],
        industries: [],
        keywords: preset.keywords,
      }
    }));
  };

  // --- Views ---

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <Header
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onLogout={handleLogout}
        userName={userName}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">

        {currentPage === 'dashboard' && (
          <div className="animate-[fadeIn_0.3s_ease-out]">
            {activeCampaignId === null ? (
              <CampaignHub
                history={history}
                onEnterCampaign={handleEnterCampaign}
              />
            ) : (
              <CampaignWorkspace
                campaignId={activeCampaignId}
                config={config}
                onChange={handleConfigChange}
                onSearch={handleSearch}
                onStop={handleStop}
                isSearching={isSearching}
                logs={logs}
                terminalVisible={terminalVisible}
                terminalExpanded={terminalExpanded}
                onToggleTerminal={() => setTerminalExpanded(!terminalExpanded)}
                leads={leads}
                history={history.filter(s => s.icp_type === activeCampaignId)}
                onViewMessage={setSelectedLead}
                onBack={() => {
                  setActiveCampaignId(null);
                  setLeads([]);
                  setLogs([]);
                  setTerminalVisible(false);
                }}
                onOpenCriteria={handleOpenCriteria}
                totalLeadsGenerated={totalLeadsGenerated}
              />
            )}
          </div>
        )}

        {currentPage === 'campaigns' && (
          <CampaignsView
            history={history}
            onSelectSession={handleViewSessionResults}
          />
        )}

      </main>

      {/* Search Criteria Modal */}
      <SearchCriteriaModal
        isOpen={isCriteriaModalOpen}
        onClose={() => setIsCriteriaModalOpen(false)}
        currentQuery={config.query}
        onSave={handleSaveCriteria}
      />

      {/* Message Draft Modal */}
      {selectedLead && (
        <MessageModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {/* Search History Results Popup */}
      {selectedHistorySession && (
        <HistoryModal
          session={selectedHistorySession}
          onClose={() => setSelectedHistorySession(null)}
          onViewMessage={setSelectedLead}
        />
      )}
    </div>
  );
}

export default App;
