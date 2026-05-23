import React, { useMemo, useState } from 'react';
import { LinkedInCampaign, LinkedInLead } from './types/linkedin';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Search,
  ChevronUp,
  ChevronDown,
  Users,
  X,
} from 'lucide-react';

interface LinkedInCampaignDetailProps {
  campaign: LinkedInCampaign;
  leads: LinkedInLead[];
  onBack: () => void;
}

// ─── Status badge ──────────────────────────────────────────────────────────

const LEAD_STATUS_CLASSES: Record<LinkedInLead['status'], string> = {
  scraped:   'bg-secondary/60 text-muted-foreground',
  enriched:  'bg-blue-500/15 text-blue-400',
  ready:     'bg-amber-500/15 text-amber-400',
  contacted: 'bg-emerald-500/15 text-emerald-400',
  replied:   'bg-primary/15 text-primary',
  discarded: 'bg-destructive/15 text-destructive',
};
const LEAD_STATUS_LABELS: Record<LinkedInLead['status'], string> = {
  scraped:   'Extraído',
  enriched:  'Enriquecido',
  ready:     'Listo',
  contacted: 'Contactado',
  replied:   'Respondió',
  discarded: 'Descartado',
};

function LeadStatusBadge({ status }: { status: LinkedInLead['status'] }) {
  return (
    <span
      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${LEAD_STATUS_CLASSES[status]}`}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}

// ─── CSV export ────────────────────────────────────────────────────────────

function escapeCSV(value: string | undefined): string {
  if (!value) return '';
  const cleaned = value.replace(/"/g, '""').replace(/[\n\r]/g, ' ');
  return cleaned.includes(',') || cleaned.includes('"') ? `"${cleaned}"` : cleaned;
}

function exportLeadsToCSV(campaign: LinkedInCampaign, leads: LinkedInLead[]) {
  const headers = ['Nombre', 'Apellido', 'Email', 'Cargo', 'Perfil de LinkedIn'];
  const rows = leads.map((l) => {
    const fullName = (l.name ?? '').trim();
    const spaceIdx = fullName.indexOf(' ');
    const firstName = spaceIdx === -1 ? fullName : fullName.slice(0, spaceIdx);
    const lastName = spaceIdx === -1 ? '' : fullName.slice(spaceIdx + 1);
    return [
      escapeCSV(firstName),
      escapeCSV(lastName),
      escapeCSV(l.email),
      escapeCSV(l.headline),
      escapeCSV(l.linkedin_url),
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `linkedin_campaign_${campaign.id}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Date-range filter for export ─────────────────────────────────────────

function getFilteredLeadsForExport(
  leads: LinkedInLead[],
  startDate: string | null,
  endDate: string | null,
): LinkedInLead[] {
  if (!startDate && !endDate) return leads;
  return leads.filter((lead) => {
    const date = lead.created_at instanceof Date ? lead.created_at : new Date(lead.created_at);
    if (startDate) {
      const from = new Date(startDate + 'T00:00:00');
      if (date < from) return false;
    }
    if (endDate) {
      const to = new Date(endDate + 'T23:59:59');
      if (date > to) return false;
    }
    return true;
  });
}

// ─── Sort helpers ──────────────────────────────────────────────────────────

type SortKey = keyof Pick<LinkedInLead, 'name' | 'headline' | 'company' | 'location' | 'status'>;
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey | null; label: string; width: string }[] = [
  { key: 'name',     label: 'Nombre',           width: 'w-[15%]' },
  { key: 'headline', label: 'Titular',           width: 'w-[20%]' },
  { key: 'company',  label: 'Empresa',           width: 'w-[15%]' },
  { key: null,       label: 'LinkedIn',          width: 'w-[10%]' },
  { key: 'location', label: 'Ubicación',         width: 'w-[15%]' },
  { key: null,       label: 'Email',             width: 'w-[17%]' },
  { key: 'status',   label: 'Estado',            width: 'w-[8%]'  },
];

// ─── Component ─────────────────────────────────────────────────────────────

export function LinkedInCampaignDetail({ campaign, leads, onBack }: LinkedInCampaignDetailProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  const handleExport = () => {
    const result = getFilteredLeadsForExport(leads, startDate, endDate);
    if (result.length === 0 && (startDate || endDate)) {
      alert('No hay leads en este rango de fechas');
      return;
    }
    exportLeadsToCSV(campaign, result);
  };

  const handleSort = (key: SortKey | null) => {
    if (!key) return;
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredLeads = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return leads
      .filter(
        (l) =>
          !q ||
          l.name.toLowerCase().includes(q) ||
          l.headline.toLowerCase().includes(q) ||
          l.company.toLowerCase().includes(q) ||
          l.location.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const aVal = (a[sortKey] ?? '').toLowerCase();
        const bVal = (b[sortKey] ?? '').toLowerCase();
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
  }, [leads, searchQuery, sortKey, sortDir]);

  function SortIcon({ col }: { col: SortKey | null }) {
    if (!col || sortKey !== col)
      return <ChevronUp className="w-3 h-3 opacity-20 group-hover:opacity-60 transition-opacity" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3 h-3 text-primary" />
    ) : (
      <ChevronDown className="w-3 h-3 text-primary" />
    );
  }

  return (
    <div className="flex flex-col h-full space-y-5 animate-[fadeIn_0.3s_ease-out]">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left: back + title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-border hover:bg-secondary hover:text-foreground text-muted-foreground transition-colors flex-shrink-0"
            title="Volver a campañas"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2
              className="font-bold text-lg leading-tight truncate max-w-[420px]"
              title={campaign.name}
            >
              {campaign.name}
            </h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Users className="w-3 h-3" />
              {filteredLeads.length}
              {filteredLeads.length !== leads.length && ` / ${leads.length}`} leads
            </p>
          </div>
        </div>

        {/* Right: search + date filter + export */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {/* Row 1: search + export button */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar lead…"
                className="pl-8 pr-3 py-2 text-sm bg-secondary/40 border border-input rounded-lg focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground w-48 transition-all"
              />
            </div>
            <button
              onClick={handleExport}
              disabled={leads.length === 0}
              className="relative flex items-center gap-2 bg-primary text-primary-foreground font-semibold text-sm px-4 py-2 rounded-lg hover:brightness-110 active:scale-[0.98] transition-all shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Descargar Excel / CSV</span>
              <span className="sm:hidden">CSV</span>
              {(startDate || endDate) && (
                <span className="hidden sm:inline ml-1 bg-white/20 text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none tracking-wide">
                  FILTRADO
                </span>
              )}
            </button>
          </div>

          {/* Row 2: date range filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">Rango exportación:</span>
            <input
              type="date"
              value={startDate ?? ''}
              onChange={(e) => setStartDate(e.target.value || null)}
              title="Fecha de inicio"
              className="px-3 py-1.5 text-sm bg-secondary/40 border border-input rounded-lg focus:ring-1 focus:ring-primary focus:border-primary text-foreground transition-all"
            />
            <span className="text-xs text-muted-foreground select-none">→</span>
            <input
              type="date"
              value={endDate ?? ''}
              onChange={(e) => setEndDate(e.target.value || null)}
              title="Fecha de fin"
              className="px-3 py-1.5 text-sm bg-secondary/40 border border-input rounded-lg focus:ring-1 focus:ring-primary focus:border-primary text-foreground transition-all"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(null); setEndDate(null); }}
                title="Limpiar filtro de fechas"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Data Grid ── */}
      {filteredLeads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground bg-card border border-border rounded-xl">
          <Search className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">Sin resultados</p>
          <p className="text-sm mt-1">Prueba con otro término de búsqueda.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm flex flex-col" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {/* Scrollable container — allows sticky thead to work */}
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse text-sm min-w-[700px]">
              {/* ── Sticky header ── */}
              <thead className="sticky top-0 z-10">
                <tr className="bg-secondary/80 backdrop-blur border-b border-border">
                  <th className="w-[40px] px-2 py-2 text-center text-xs font-medium text-muted-foreground select-none">
                    #
                  </th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.label}
                      className={`${col.width} px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${col.key ? 'cursor-pointer select-none group hover:text-foreground transition-colors' : ''}`}
                      onClick={() => handleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.key && <SortIcon col={col.key} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ── Body ── */}
              <tbody>
                {filteredLeads.map((lead, idx) => (
                  <tr
                    key={lead.id}
                    className={`border-b border-border/40 hover:bg-primary/5 transition-colors ${
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-secondary/20'
                    }`}
                  >
                    {/* Row number */}
                    <td className="px-2 py-2 text-center text-xs text-muted-foreground tabular-nums select-none">
                      {idx + 1}
                    </td>

                    {/* Name */}
                    <td className="px-3 py-2 font-medium text-foreground truncate max-w-[160px]" title={lead.name}>
                      {lead.name || <span className="text-muted-foreground italic">—</span>}
                    </td>

                    {/* Headline */}
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]" title={lead.headline}>
                      {lead.headline || <span className="italic">—</span>}
                    </td>

                    {/* Company */}
                    <td className="px-3 py-2 text-foreground truncate max-w-[160px]" title={lead.company}>
                      {lead.company || <span className="text-muted-foreground italic">—</span>}
                    </td>

                    {/* LinkedIn URL */}
                    <td className="px-3 py-2">
                      {lead.linkedin_url ? (
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline hover:text-primary/80 transition-colors text-xs"
                          title={lead.linkedin_url}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          Ver perfil
                        </a>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">—</span>
                      )}
                    </td>

                    {/* Location */}
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]" title={lead.location}>
                      {lead.location || <span className="italic">—</span>}
                    </td>

                    {/* Email */}
                    <td className="px-3 py-2">
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          className="text-muted-foreground hover:text-foreground transition-colors truncate block max-w-[180px] text-xs"
                          title={lead.email}
                        >
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="border-t border-border px-4 py-2 bg-secondary/20 flex items-center justify-between text-xs text-muted-foreground flex-shrink-0">
            <span>
              Mostrando <span className="font-semibold text-foreground">{filteredLeads.length}</span> de{' '}
              <span className="font-semibold text-foreground">{leads.length}</span> leads
            </span>
            <span>
              Campaña creada el{' '}
              {campaign.created_at.toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
