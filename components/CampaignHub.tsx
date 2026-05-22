import React from 'react';
import { SearchSession } from '../lib/types';
import { ICP_PRESETS, IcpPreset } from '../lib/searchFilterData';
import { Activity, Users, ChevronRight } from 'lucide-react';

interface CampaignHubProps {
  history: SearchSession[];
  onEnterCampaign: (preset: IcpPreset) => void;
}

export function CampaignHub({ history, onEnterCampaign }: CampaignHubProps) {
  return (
    <div className="space-y-10 animate-[fadeIn_0.3s_ease-out]">
      {/* Hero */}
      <div className="max-w-4xl mx-auto text-center space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Apex<span className="text-primary">Engine</span>
        </h1>
        <p className="text-muted-foreground text-sm">Selecciona una campaña para generar y gestionar leads</p>
      </div>

      {/* Campaign cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {ICP_PRESETS.map(preset => {
          const sessions = history.filter(s => s.icp_type === preset.id);
          const totalLeads = sessions.reduce((sum, s) => sum + s.leads.length, 0);

          return (
            <button
              key={preset.id}
              onClick={() => onEnterCampaign(preset)}
              className="group bg-card border border-border rounded-2xl p-7 text-left hover:border-primary/60 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-200 active:scale-[0.99] flex flex-col gap-5"
            >
              {/* Icon + arrow */}
              <div className="flex items-start justify-between">
                <span className="text-4xl">{preset.emoji}</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all mt-1" />
              </div>

              {/* Title + description */}
              <div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors mb-1">
                  {preset.label}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{preset.description}</p>
              </div>

              {/* Stats */}
              <div className="flex items-center justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  {sessions.length} búsqueda{sessions.length !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-primary">
                  <Users className="w-3.5 h-3.5" />
                  {totalLeads} leads
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
