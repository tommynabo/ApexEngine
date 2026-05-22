import React, { useState } from 'react';
import { Copy, Check, ExternalLink, Zap } from 'lucide-react';
import { Lead, SearchSession } from '../lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineLead extends Lead {
  sessionDate: Date;
}

interface CampaignPipelineProps {
  sessions: SearchSession[];
  activeLeads?: Lead[];
  onViewMessage: (lead: Lead) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getDateBucket(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86_400_000);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (d.getTime() === today.getTime()) return 'Hoy';
  if (d.getTime() === yesterday.getTime()) return 'Ayer';
  if (d >= sevenDaysAgo) {
    return date.toLocaleDateString('es-ES', { weekday: 'long' });
  }
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Date bucket sort order: Hoy first, Ayer second, weekdays in desc order, older dates last
function bucketSortKey(bucket: string, sampleDate: Date): number {
  if (bucket === 'Hoy') return 0;
  if (bucket === 'Ayer') return 1;
  // Use negative timestamp so newer dates sort first after Ayer
  return 2 + (Date.now() - sampleDate.getTime()) / 86_400_000;
}

function calcScore(lead: Lead): number {
  const a = lead.aiAnalysis;
  if (!a) return 0;
  const checks = [
    !!a.summary,
    Array.isArray(a.painPoints) && a.painPoints.length > 0,
    !!a.generatedIcebreaker,
    !!a.fullMessage,
    !!a.psychologicalProfile,
    !!a.businessMoment,
    !!a.salesAngle,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

const STATUS_LABEL: Record<string, string> = {
  scraped: 'Detectado',
  enriched: 'Enriquecido',
  ready: 'Listo',
  contacted: 'Contactado',
  replied: 'Respondió',
  discarded: 'Descartado',
};

const STATUS_CLASS: Record<string, string> = {
  scraped: 'bg-secondary/60 text-muted-foreground',
  enriched: 'bg-blue-900/40 text-blue-300',
  ready: 'bg-green-900/40 text-green-400',
  contacted: 'bg-yellow-900/40 text-yellow-300',
  replied: 'bg-primary/10 text-primary',
  discarded: 'bg-destructive/20 text-destructive',
};

// ─── Row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  lead: PipelineLead | Lead;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onView: (lead: Lead) => void;
}

function PipelineRow({ lead, copiedId, onCopy, onView }: RowProps) {
  const score = calcScore(lead);
  const scoreColor =
    score >= 70 ? 'bg-green-400' : score >= 40 ? 'bg-yellow-400' : 'bg-destructive';

  const message = lead.aiAnalysis?.fullMessage || '';
  const messagePreview = message.length > 80 ? message.slice(0, 80) + '…' : message;

  return (
    <tr className="group border-b border-border hover:bg-secondary/20 transition-colors">
      {/* Candidate */}
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold text-xs flex items-center justify-center flex-shrink-0 border border-primary/20">
            {getInitials(lead.decisionMaker?.name)}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm text-foreground leading-tight truncate">
              {lead.decisionMaker?.name || '—'}
            </p>
            {lead.location && (
              <p className="text-xs text-muted-foreground truncate">{lead.location}</p>
            )}
          </div>
        </div>
      </td>

      {/* Role */}
      <td className="px-4 py-3 align-middle">
        <div className="min-w-0">
          <p className="text-sm text-foreground truncate">{lead.decisionMaker?.role || '—'}</p>
          {lead.decisionMaker?.linkedin ? (
            <a
              href={lead.decisionMaker.linkedin}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-0.5"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="truncate">{lead.companyName || 'Ver Perfil'}</span>
            </a>
          ) : (
            <p className="text-xs text-muted-foreground truncate">{lead.companyName}</p>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3 align-middle">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_CLASS[lead.status] ?? 'bg-secondary/60 text-muted-foreground'}`}
        >
          {STATUS_LABEL[lead.status] ?? lead.status}
        </span>
      </td>

      {/* Message */}
      <td className="px-4 py-3 align-middle max-w-xs">
        {message ? (
          <div className="flex items-start gap-2">
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1">
              {messagePreview}
            </p>
            <button
              onClick={() => onCopy(lead.id, message)}
              title="Copiar mensaje"
              className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors border border-border rounded px-1.5 py-0.5 hover:border-primary/40"
            >
              {copiedId === lead.id ? (
                <Check className="w-3 h-3 text-green-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50 italic">Sin mensaje</span>
        )}
      </td>

      {/* Score */}
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-2 min-w-[80px]">
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreColor}`}
              style={{ width: `${score}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">{score}%</span>
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 align-middle text-right">
        <button
          onClick={() => onView(lead)}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 rounded-md text-xs font-medium transition-all"
        >
          Ver
        </button>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CampaignPipeline({ sessions, activeLeads = [], onViewMessage }: CampaignPipelineProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Flatten all historical leads, attach sessionDate
  const historicalLeads: PipelineLead[] = sessions.flatMap(s =>
    s.leads.map(l => ({ ...l, sessionDate: s.date }))
  );

  // Group historical leads by date bucket
  const groupMap = new Map<string, { leads: PipelineLead[]; sampleDate: Date }>();
  for (const lead of historicalLeads) {
    const bucket = getDateBucket(lead.sessionDate);
    const existing = groupMap.get(bucket);
    if (existing) {
      existing.leads.push(lead);
    } else {
      groupMap.set(bucket, { leads: [lead], sampleDate: lead.sessionDate });
    }
  }

  // Sort groups: Hoy, Ayer, then descending
  const sortedGroups = [...groupMap.entries()].sort(
    ([a, aVal], [b, bVal]) =>
      bucketSortKey(a, aVal.sampleDate) - bucketSortKey(b, bVal.sampleDate)
  );

  const totalLeads = historicalLeads.length + activeLeads.length;

  if (totalLeads === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
        <p className="font-medium">Pipeline vacío</p>
        <p className="text-sm mt-1">Los leads que generes aparecerán aquí agrupados por fecha.</p>
      </div>
    );
  }

  const tableHeader = (
    <thead>
      <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border bg-secondary/20">
        <th className="px-4 py-3 font-medium text-left">Candidato</th>
        <th className="px-4 py-3 font-medium text-left">Rol actual</th>
        <th className="px-4 py-3 font-medium text-left">Estado</th>
        <th className="px-4 py-3 font-medium text-left">Mensaje</th>
        <th className="px-4 py-3 font-medium text-left">Score</th>
        <th className="px-4 py-3 font-medium text-right">Acciones</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-6">
      {/* Live section */}
      {activeLeads.length > 0 && (
        <div className="bg-card border border-primary/30 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-primary/20 flex items-center gap-2 bg-primary/5">
            <Zap className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-sm font-semibold text-primary">En vivo</span>
            <span className="ml-auto bg-primary/20 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
              {activeLeads.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              {tableHeader}
              <tbody>
                {activeLeads.map(lead => (
                  <PipelineRow
                    key={lead.id}
                    lead={lead}
                    copiedId={copiedId}
                    onCopy={handleCopy}
                    onView={onViewMessage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historical groups */}
      {sortedGroups.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          {/* Pipeline header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-base text-foreground">
              Pipeline
              <span className="ml-2 text-muted-foreground font-normal text-sm">({historicalLeads.length})</span>
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              {tableHeader}
              <tbody>
                {sortedGroups.map(([bucket, { leads }]) => (
                  <React.Fragment key={bucket}>
                    {/* Date group divider */}
                    <tr className="bg-secondary/30 border-b border-t border-border">
                      <td colSpan={6} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground capitalize">{bucket}</span>
                          <span className="bg-primary/10 text-primary text-xs font-medium px-1.5 py-0.5 rounded-full">
                            {leads.length} lead{leads.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {leads.map(lead => (
                      <PipelineRow
                        key={lead.id}
                        lead={lead}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                        onView={onViewMessage}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
