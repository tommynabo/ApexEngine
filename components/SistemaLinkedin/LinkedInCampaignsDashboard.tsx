import React from 'react';
import { LinkedInCampaign } from './types/linkedin';
import { Linkedin, Calendar, Users, ArrowRight, PlusCircle, CheckCircle, Clock, PauseCircle } from 'lucide-react';

interface LinkedInCampaignsDashboardProps {
  campaigns: LinkedInCampaign[];
  onSelectCampaign: (id: string) => void;
}

const STATUS_CONFIG: Record<
  LinkedInCampaign['status'],
  { label: string; icon: React.ReactNode; classes: string }
> = {
  active: {
    label: 'Activa',
    icon: <Clock className="w-3 h-3" />,
    classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  completed: {
    label: 'Completada',
    icon: <CheckCircle className="w-3 h-3" />,
    classes: 'bg-primary/15 text-primary border-primary/30',
  },
  paused: {
    label: 'Pausada',
    icon: <PauseCircle className="w-3 h-3" />,
    classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
};

function StatusBadge({ status }: { status: LinkedInCampaign['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.classes}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export function LinkedInCampaignsDashboard({
  campaigns,
  onSelectCampaign,
}: LinkedInCampaignsDashboardProps) {
  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-[fadeIn_0.4s_ease-out]">
        <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-5">
          <Linkedin className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Sin campañas LinkedIn</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Ejecuta una búsqueda desde el Panel para que aparezca aquí como campaña.
        </p>
      </div>
    );
  }

  const totalLeads = campaigns.reduce((sum, c) => sum + c.total_leads, 0);

  return (
    <div className="space-y-8 animate-[fadeIn_0.35s_ease-out]">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Linkedin className="w-6 h-6 text-primary" />
            Sistema LinkedIn
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {campaigns.length} campaña{campaigns.length !== 1 ? 's' : ''} &middot;{' '}
            {totalLeads} lead{totalLeads !== 1 ? 's' : ''} en total
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Campañas</p>
          <p className="text-2xl font-bold text-foreground">{campaigns.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Leads totales</p>
          <p className="text-2xl font-bold text-primary">{totalLeads}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Activas</p>
          <p className="text-2xl font-bold text-emerald-400">
            {campaigns.filter((c) => c.status === 'active').length}
          </p>
        </div>
      </div>

      {/* Campaign grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {campaigns.map((campaign) => (
          <button
            key={campaign.id}
            onClick={() => onSelectCampaign(campaign.id)}
            className="group bg-card border border-border rounded-xl p-5 text-left hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 flex flex-col gap-4 active:scale-[0.99]"
          >
            {/* Top: icon + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="w-10 h-10 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                <Linkedin className="w-5 h-5 text-primary" />
              </div>
              <StatusBadge status={campaign.status} />
            </div>

            {/* Campaign name */}
            <div className="flex-1 min-w-0">
              <h3
                className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-2 text-sm"
                title={campaign.name}
              >
                {campaign.name}
              </h3>
            </div>

            {/* Meta row */}
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-3 mt-auto">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {campaign.created_at.toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Users className="w-3.5 h-3.5 text-primary" />
                {campaign.total_leads} leads
                <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform text-primary" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
