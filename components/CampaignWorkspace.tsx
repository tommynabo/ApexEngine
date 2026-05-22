import React from 'react';
import { ArrowLeft, Download, History, ExternalLink } from 'lucide-react';
import { Lead, SearchConfigState, SearchSession } from '../lib/types';
import { ICP_PRESETS } from '../lib/searchFilterData';
import { SearchConfig } from './SearchConfig';
import { AgentTerminal } from './AgentTerminal';
import { LeadsTable } from './LeadsTable';

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
  onSelectSession: (session: SearchSession) => void;
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

function downloadCSV(sessions: SearchSession[], filename: string) {
  const headers = ['Nombre', 'Cargo', 'Empresa', 'LinkedIn', 'Email', 'Teléfono', 'Ubicación', 'Estado'];
  const rows = sessions.flatMap(s =>
    s.leads.map(l => [
      escapeCSV(l.decisionMaker?.name),
      escapeCSV(l.decisionMaker?.role),
      escapeCSV(l.companyName),
      escapeCSV(l.decisionMaker?.linkedin),
      escapeCSV(l.decisionMaker?.email),
      escapeCSV(l.decisionMaker?.phone),
      escapeCSV(l.location),
      escapeCSV(l.status),
    ].join(','))
  );
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
  leads, history, onViewMessage, onSelectSession, onBack,
  onOpenCriteria, totalLeadsGenerated,
}: CampaignWorkspaceProps) {
  const preset = ICP_PRESETS.find(p => p.id === campaignId)!;
  const totalHistoryLeads = history.reduce((sum, s) => sum + s.leads.length, 0);
  const dateStr = new Date().toISOString().slice(0, 10);

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
            {history.length} búsqueda{history.length !== 1 ? 's' : ''} · {totalHistoryLeads} leads acumulados
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => downloadCSV(history, `${preset.label}_total_${dateStr}.csv`)}
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
      />

      <AgentTerminal
        logs={logs}
        isVisible={terminalVisible}
        isExpanded={terminalExpanded}
        onToggleExpand={onToggleTerminal}
      />

      {leads.length > 0 && (
        <LeadsTable leads={leads} onViewMessage={onViewMessage} />
      )}

      {/* ── Campaign history ── */}
      {history.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-lg">Historial de {preset.label}</h3>
            <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded-full">
              {history.length}
            </span>
          </div>

          <div className="space-y-2">
            {history.map(session => (
              <div
                key={session.id}
                className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 hover:border-border/80 transition-colors"
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate" title={session.query}>
                    {session.query}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {session.date.toLocaleDateString('es-ES', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                    {' · '}
                    <span className="text-primary font-semibold">{session.leads.length} leads</span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onSelectSession(session)}
                    disabled={session.leads.length === 0}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-secondary transition-colors disabled:opacity-40"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver leads
                  </button>
                  <button
                    onClick={() => downloadCSV(
                      [session],
                      `${preset.label}_${session.date.toISOString().slice(0, 10)}.csv`,
                    )}
                    disabled={session.leads.length === 0}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40"
                  >
                    <Download className="w-3 h-3" />
                    CSV
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length === 0 && leads.length === 0 && !isSearching && (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <p className="font-medium">Sin búsquedas aún para esta campaña</p>
          <p className="text-sm mt-1">Usa el generador de arriba para crear tus primeros leads.</p>
        </div>
      )}
    </div>
  );
}
