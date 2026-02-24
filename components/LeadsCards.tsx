import React, { useState } from 'react';
import { Lead } from '../lib/types';
import { Copy, Check, X, AlertCircle } from 'lucide-react';

interface LeadsCardsProps {
  leads: Lead[];
  onMarkContacted: (leadId: string, messageType: 'a' | 'b') => void;
  onMarkDiscarded: (leadId: string) => void;
}

export function LeadsCards({ leads, onMarkContacted, onMarkDiscarded }: LeadsCardsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyMessage = (message: string, leadId: string) => {
    navigator.clipboard.writeText(message).then(() => {
      setCopiedId(leadId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (leads.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 px-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground text-lg">No hay contactos disponibles</p>
          <p className="text-muted-foreground text-sm mt-2">Realiza una búsqueda para ver los leads</p>
        </div>
      </div>
    );
  }

  // Filter out discarded leads
  const activeLead = leads.find(l => l.status !== 'discarded');
  
  if (!activeLead) {
    return (
      <div className="flex items-center justify-center py-16 px-4">
        <div className="text-center">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-foreground text-lg font-medium">¡Todos los contactos procesados!</p>
          <p className="text-muted-foreground text-sm mt-2">Total de leads revisados: {leads.length}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4 max-w-2xl mx-auto">
      <div className="sticky top-4 z-40 backdrop-blur-sm bg-background/75 border border-border rounded-lg p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Contacto <span className="font-bold text-foreground">{leads.findIndex(l => l.id === activeLead.id) + 1}</span> de <span className="font-bold text-foreground">{leads.length}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {Math.round((leads.findIndex(l => l.id === activeLead.id) / leads.length) * 100)}% completado
          </span>
        </div>
        <div className="mt-2 w-full bg-secondary h-2 rounded-full overflow-hidden">
          <div 
            className="bg-primary h-full transition-all"
            style={{ width: `${Math.round((leads.findIndex(l => l.id === activeLead.id) / leads.length) * 100)}%` }}
          />
        </div>
      </div>

      {/* Lead Card */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden animate-[slideIn_0.3s_ease-out]">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{activeLead.decisionMaker?.name || 'Contacto'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {activeLead.decisionMaker?.role} @ {activeLead.companyName}
              </p>
              {activeLead.location && (
                <p className="text-xs text-muted-foreground mt-2">📍 {activeLead.location}</p>
              )}
            </div>
            {activeLead.isNPLPotential && (
              <div className="bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-500/30">
                NPL Potential
              </div>
            )}
          </div>
        </div>

        {/* Messages Section */}
        <div className="p-6 space-y-4">
          {/* Message A - Generic */}
          {activeLead.messageA && (
            <div className="bg-secondary/40 border border-border/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-foreground">Mensaje A - Automatización</h3>
                <button
                  onClick={() => handleCopyMessage(activeLead.messageA!, activeLead.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    copiedId === activeLead.id && activeLead.messageA
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
                  }`}
                >
                  {copiedId === activeLead.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar
                    </>
                  )}
                </button>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{activeLead.messageA}</p>
            </div>
          )}

          {/* Message B - NPL */}
          {activeLead.messageB && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-amber-300">Mensaje B - NPLs (Nicho)</h3>
                <button
                  onClick={() => handleCopyMessage(activeLead.messageB!, activeLead.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    copiedId === activeLead.id && activeLead.messageB
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                  }`}
                >
                  {copiedId === activeLead.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar
                    </>
                  )}
                </button>
              </div>
              <p className="text-sm text-amber-200 leading-relaxed">{activeLead.messageB}</p>
            </div>
          )}

          {!activeLead.messageA && !activeLead.messageB && (
            <div className="bg-secondary/40 border border-dashed border-border rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">Generando mensajes con IA...</p>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="bg-secondary/20 border-t border-border p-4 flex gap-3">
          <button
            onClick={() => onMarkContacted(activeLead.id, 'a')}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-all text-sm"
          >
            <Check className="w-4 h-4" /> Contactado
          </button>
          <button
            onClick={() => onMarkDiscarded(activeLead.id)}
            className="px-4 py-3 border border-border rounded-lg text-foreground hover:bg-secondary transition-all font-medium text-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-muted-foreground">Pendientes</p>
          <p className="text-lg font-bold text-foreground mt-1">
            {leads.filter(l => l.status === 'ready').length}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-muted-foreground">Contactados</p>
          <p className="text-lg font-bold text-foreground mt-1">
            {leads.filter(l => l.status === 'contacted').length}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-muted-foreground">Descartados</p>
          <p className="text-lg font-bold text-foreground mt-1">
            {leads.filter(l => l.status === 'discarded').length}
          </p>
        </div>
      </div>
    </div>
  );
}
