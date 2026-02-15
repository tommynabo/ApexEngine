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
import { Lead, SearchConfigState, PageView, SearchSession } from './lib/types';
import { PROJECT_CONFIG } from './config/project';
import { searchService } from './services/search/SearchService';
import { autopilotService } from './services/autopilot/AutopilotService';
import { supabase } from './lib/supabase';

function App() {
  // Navigation & Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<PageView>('login');

  // Search State
  const [config, setConfig] = useState<SearchConfigState>({
    query: PROJECT_CONFIG.targets.icp,
    source: 'linkedin',
    mode: 'fast',
    maxResults: 10
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

  // Autopilot State
  const [autopilotEnabled, setAutopilotEnabled] = useState(autopilotService.getConfig().enabled);
  const [autopilotTime, setAutopilotTime] = useState(autopilotService.getConfig().scheduledTime);
  const [autopilotQuantity, setAutopilotQuantity] = useState(autopilotService.getConfig().leadsQuantity);

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

    // Initialize autopilot monitoring
    autopilotService.initialize();

    return () => {
      searchService.stop();
      autopilotService.destroy();
    };
  }, []);

  const loadProfile = async (uid: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('target_icp, full_name')
        .eq('id', uid)
        .single();

      if (data) {
        if (data.target_icp) {
          console.log('Loaded Profile ICP:', data.target_icp);
        }
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
      const { data, error } = await supabase
        .from('search_results_diego')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading history:', error);
        return;
      }

      if (data && data.length > 0) {
        const sessions: SearchSession[] = data.map(row => ({
          id: row.session_id || row.id,
          date: new Date(row.created_at),
          query: row.query || '',
          source: row.platform as any || 'gmail',
          resultsCount: Array.isArray(row.lead_data) ? row.lead_data.length : 0,
          leads: Array.isArray(row.lead_data) ? row.lead_data : []
        }));
        setHistory(sessions);
        console.log(`[HISTORY] Loaded ${sessions.length} sessions from cloud`);
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
          leads: results
        };
        setHistory(prev => [newSession, ...prev]);

        // Save to Supabase (Cloud)
        // Save to Supabase (Cloud)
        if (userId) {
          try {
            console.log('[App] Saving to search_results_diego for user:', userId);
            const { error } = await supabase.from('search_results_diego').insert({
              user_id: userId,
              session_id: newSession.id,
              platform: config.source,
              query: config.query,
              lead_data: results as any,
              status: 'new'
            });
            if (error) {
              console.error('DB Error:', error);
              addLog(`[ERROR] Fallo al guardar en base de datos: ${error.message}`);
            }
            else addLog('[DB] Resultados guardados en la nube de forma segura.');
          } catch (err) {
            console.error('Failed to save results to DB', err);
            addLog(`[ERROR] Excepción al guardar: ${err}`);
          }
        } else {
          console.warn('[App] No userId found, skipping Supabase save');
          addLog('[ADVERTENCIA] No se pudo guardar en la nube (Usuario no identificado).');
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
      autopilotService.markSearchComplete();
    }
  };

  // --- Autopilot Logic ---

  const executeAutopilotSearch = (quantity: number) => {
    const autopilotConfig = { ...config, maxResults: quantity };

    setIsSearching(true);
    setTerminalVisible(true);
    setTerminalExpanded(true);
    setLogs([]);
    setLeads([]);

    searchService.startSearch(
      autopilotConfig,
      (message) => addLog(message),
      async (results) => {
        setIsSearching(false);
        setLeads(results);

        const newSession: SearchSession = {
          id: Date.now().toString(),
          date: new Date(),
          query: autopilotConfig.query,
          source: autopilotConfig.source,
          resultsCount: results.length,
          leads: results
        };
        setHistory(prev => [newSession, ...prev]);

        if (userId) {
          try {
            const { error } = await supabase.from('search_results_diego').insert({
              user_id: userId,
              session_id: newSession.id,
              platform: autopilotConfig.source,
              query: autopilotConfig.query,
              lead_data: results as any,
              status: 'autopilot'
            });
            if (error) console.error('DB Error:', error);
            else addLog('[AUTOPILOT] ✅ Resultados del piloto automático guardados en la nube.');
          } catch (err) {
            console.error('Failed to save autopilot results to DB', err);
          }
        }

        autopilotService.markSearchComplete();
        playGlassSound();
        setTimeout(() => setTerminalExpanded(false), 1500);
      },
      userId
    );
  };

  useEffect(() => {
    autopilotService.setCallbacks(executeAutopilotSearch, addLog);
  }, [userId, config]);

  const handleAutopilotToggle = (enabled: boolean) => {
    setAutopilotEnabled(enabled);
    if (enabled) {
      autopilotService.enable(autopilotTime, autopilotQuantity);
    } else {
      autopilotService.disable();
    }
  };

  const handleAutopilotTimeChange = (time: string) => {
    setAutopilotTime(time);
    autopilotService.updateTime(time);
    if (autopilotEnabled) {
      autopilotService.enable(time, autopilotQuantity);
    }
  };

  const handleAutopilotQuantityChange = (quantity: number) => {
    setAutopilotQuantity(quantity);
    autopilotService.updateQuantity(quantity);
    if (autopilotEnabled) {
      autopilotService.enable(autopilotTime, quantity);
    }
  };

  const handleConfigChange = (updates: Partial<SearchConfigState>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const handleOpenCriteria = () => {
    setIsCriteriaModalOpen(true);
  };

  const handleSaveCriteria = (newQuery: string) => {
    setConfig(prev => ({ ...prev, query: newQuery }));
    setIsCriteriaModalOpen(false);
  };

  const handleViewSessionResults = (session: SearchSession) => {
    setSelectedHistorySession(session);
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
            <div className="max-w-4xl mx-auto mb-10 text-center space-y-2">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Diego <span className="text-primary">LeadOS</span>
              </h1>
            </div>

            <SearchConfig
              config={config}
              onChange={handleConfigChange}
              onSearch={handleSearch}
              onStop={handleStop}
              isSearching={isSearching}
              onOpenCriteria={handleOpenCriteria}
              autopilotEnabled={autopilotEnabled}
              autopilotTime={autopilotTime}
              autopilotQuantity={autopilotQuantity}
              onAutopilotToggle={handleAutopilotToggle}
              onAutopilotTimeChange={handleAutopilotTimeChange}
              onAutopilotQuantityChange={handleAutopilotQuantityChange}
              autopilotRanToday={autopilotService.hasRunToday()}
            />

            <AgentTerminal
              logs={logs}
              isVisible={terminalVisible}
              isExpanded={terminalExpanded}
              onToggleExpand={() => setTerminalExpanded(!terminalExpanded)}
            />

            <LeadsTable
              leads={leads}
              onViewMessage={setSelectedLead}
            />
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
