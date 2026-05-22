import React from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { Lead, SearchConfigState, SearchSession } from '../lib/types';
import { ICP_PRESETS } from '../lib/searchFilterData';
import { SearchConfig } from './SearchConfig';
import { AgentTerminal } from './AgentTerminal';
import { CampaignPipeline } from './CampaignPipeline';

interface CampaignWorkspaceProps {
  campaignId: 'skool_creator' | 'agency';
  config: SearchConfigState;
  onChange: (updates: Partial<SearchConfigState>) => void;
  onSearch: () => void;
  onStop: () => void;
  isSearching: boolean;
  logs: string[];
  terminalVisible: boolean;
  terminalExpanded: boolean;
  onToggleTerminal: () => void;
  leads: Lead[];
  history: SearchSession[];
  onViewMessage: (lead: Lead) => void;
  onBack: () => void;
  onOpenCriteria: () => void;
  totalLeadsGenerated: number;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function escapeCSV(v: string | undefined): string {
  if (!v) return '';
  const s = v.replace(/"/g, '""').replace(/[\n\r]/g, ' ');
  return s.includes(',') || s.includes('"') ? `"${s}"` : s;
}

function downloadCSV(sessions: SearchSession[], activeLeads: Lead[], filename: string) {
  const headers = ['Nombre', 'Cargo', 'Empresa', 'LinkedIn', 'Email', 'Teléfono', 'Ubicación', 'Estado'];
  const allLeads = [...sessions.flatMap(s => s.leads), ...activeLeads];
  const rows = allLeads.map(l => [
    escapeCSV(l.decisionMaker?.name),
    escapeCSV(l.decisionMaker?.role),
    escapeCSV(l.companyName),
    escapeCSV(l.decisionMaker?.linkedin),
    escapeCSV(l.decisionMaker?.email),
    escapeCSV(l.decisionMaker?.phone),
    escapeCSV(l.location),
    escapeCSV(l.status),
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CampaignWorkspace({
  campaignId, config, onChange, onSearch, onStop, isSearching,
  logs, terminalVisible, terminalExpanded, onToggleTerminal,
  leads, history, onViewMessage, onBack,
  onOpenCriteria, totalLeadsGenerated,
}: CampaignWorkspaceProps) {
  const preset = ICP_PRESETS.find(p => p.id === campaignId)!;
  const totalLeads = history.reduce((sum, s) => sum + s.leads.length, 0) + leads.length;
  const dateStr = new Date().toISOString().slice(0, 10);
  const hasAnything = history.length > 0 || leads.length > 0;

  return (
    <div className="space-y-8 animate-[fadeIn_0.3s_ease-out]">

      {/* ── Campaign header ── */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          title="Volver a campañas"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            <span>{preset.emoji}</span>
            {preset.label}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalLeads} lead{totalLeads !== 1 ? 's' : ''} acumulados
          </p>
        </div>
        {hasAnything && (
          <button
            onClick={() => downloadCSV(history, leads, `${preset.label}_${dateStr}.csv`)}
            className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold text-sm px-4 py-2 rounded-lg hover:brightness-110 active:scale-[0.98] transition-all shadow-md shadow-primary/20 flex-shrink-0"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar todo</span>
          </button>
        )}
      </div>

      {/* ── Generator ── */}
      <SearchConfig
        config={config}
        onChange={onChange}
        onSearch={onSearch}
        onStop={onStop}
        isSearching={isSearching}
        onOpenCriteria={onOpenCriteria}
        totalLeadsGenerated={totalLeadsGenerated}
        hidePresets={true}
      />

      <AgentTerminal
        logs={logs}
        isVisible={terminalVisible}
        isExpanded={terminalExpanded}
        onToggleExpand={onToggleTerminal}
      />

      {/* ── Pipeline ── */}
      <CampaignPipeline
        sessions={history}
        activeLeads={leads}
        onViewMessage={onViewMessage}
      />
    </div>
  );
}
