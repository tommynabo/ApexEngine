import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SearchConfig } from './components/SearchConfig';
import { AgentTerminal } from './components/AgentTerminal';
import { LeadsTable } from './components/LeadsTable';
import { MessageModal } from './components/MessageModal';
import { LoginPage } from './components/LoginPage';
import { CampaignsView } from './components/CampaignsView';
import { HistoryModal } from './components/HistoryModal';
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
        if (userId) {
          try {
            const { error } = await supabase.from('search_results_diego').insert({
              user_id: userId,
              session_id: newSession.id,
              platform: config.source,
              query: config.query,
              lead_data: results as any,
              status: 'new'
            });
            if (error) console.error('DB Error:', error);
            else addLog('[DB] Resultados guardados en la nube de forma segura.');
          } catch (err) {
            console.error('Failed to save results to DB', err);
          }
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
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Tu Motor de Crecimiento Automatizado para Gimnasios y Centros Fitness.
              </p>
            </div>

            <SearchConfig
              config={config}
              onChange={handleConfigChange}
              onSearch={handleSearch}
              onStop={handleStop}
              isSearching={isSearching}
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
