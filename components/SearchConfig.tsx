import React, { useState } from 'react';
import { Play, Zap, Clock, Calendar } from 'lucide-react';
import { SearchConfigState } from '../lib/types';
import { PROJECT_CONFIG } from '../config/project';

interface SearchConfigProps {
  config: SearchConfigState;
  onChange: (updates: Partial<SearchConfigState>) => void;
  onSearch: () => void;
  isSearching: boolean;
  onOpenCriteria?: () => void;
  totalLeadsGenerated: number;
}

export function SearchConfig({
  config,
  onChange,
  onSearch,
  onStop,
  isSearching,
  onOpenCriteria,
  totalLeadsGenerated
}: SearchConfigProps & { onStop: () => void }) {
  // Helper to handle manual number input clearly
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseInt(e.target.value);
    if (isNaN(val)) val = 1;
    if (val < 1) val = 1;
    if (val > 20) val = 20;

    onChange({ maxResults: val });
  };

  const isLimitReached = false;
  const maxAllowedInput = 20; // Or whatever max they want per extraction

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* 1. Generador de Leads */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col relative overflow-hidden group hover:border-primary/20 transition-all h-full">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16" />

        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">Generador de Leads</h3>
              <p className="text-sm text-muted-foreground">Configuración de búsqueda</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Cantidad de Leads
                </label>
                <div className="bg-secondary/50 rounded-md px-2 py-1">
                  <span className="text-xs font-mono text-muted-foreground">MAX: 20</span>
                </div>
              </div>

              <div className="flex items-center gap-4 bg-secondary/20 p-2 rounded-xl border border-border/50">
                <input
                  type="range"
                  min="1"
                  max={maxAllowedInput}
                  step="1"
                  value={config.maxResults || 1}
                  onChange={(e) => onChange({ maxResults: parseInt(e.target.value) })}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary hover:accent-primary/80 transition-all"
                  disabled={isSearching}
                />

                {/* Clickable Number Input */}
                <input
                  type="number"
                  min="1"
                  max={maxAllowedInput}
                  value={config.maxResults}
                  onChange={handleNumberChange}
                  onClick={(e) => e.currentTarget.select()}
                  className="w-16 text-center font-bold text-lg bg-background border-2 border-input rounded-lg py-1 focus:ring-2 focus:ring-primary focus:border-primary transition-all shadow-sm"
                  disabled={isSearching || isLimitReached}
                />
              </div>

              {/* Progress Tracker Removed */}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <button
              onClick={onOpenCriteria}
              disabled={isSearching}
              className="w-full h-[40px] flex items-center justify-center rounded-lg font-bold text-sm transition-all shadow-md bg-slate-200/50 text-slate-700 hover:bg-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              ✎ Criterio de Búsqueda
            </button>

            {isSearching ? (
              <button
                onClick={onStop}
                className="w-full h-[48px] flex items-center justify-center rounded-lg font-bold text-sm transition-all shadow-lg bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 active:scale-[0.98]"
              >
                <div className="w-2 h-2 bg-red-500 rounded-sm animate-pulse mr-2" />
                DETENER GENERACIÓN
              </button>
            ) : (
              <button
                onClick={onSearch}
                disabled={!config.query}
                title={!config.query ? "Debe especificar un Criterio de Búsqueda primero" : ""}
                className="w-full h-[48px] flex items-center justify-center rounded-lg font-bold text-sm transition-all shadow-lg shadow-primary/20 bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 mr-2 fill-current" />
                Generar Ahora
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Guía de Uso Rápida */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 shadow-sm flex flex-col h-full relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16" />

        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
          <div className="p-1.5 rounded-lg bg-blue-500/10">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          Guía de Uso Rápida
        </h3>

        <div className="space-y-6 relative z-10">
          <div className="flex gap-4 group">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 group-hover:bg-blue-500/20 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-all">
              1
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-200 mb-1">Criterio de Búsqueda</p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Haz clic en <span className="text-zinc-300">"Criterio de Búsqueda"</span> para definir exactamente qué perfiles quieres encontrar. Usa palabras clave como "Empresario", "CEO" o "Agencias de Marketing B2B".
              </p>
            </div>
          </div>

          <div className="flex gap-4 group">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 group-hover:bg-blue-500/20 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-all">
              2
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-200 mb-1">Ajustar Cantidad</p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Selecciona cuántos leads quieres extraer en esta sesión. Recuerda que el programa está limitado a un máximo de <span className="text-blue-400 font-bold">20 personas por búsqueda</span>.
              </p>
            </div>
          </div>

          <div className="flex gap-4 group">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 group-hover:bg-blue-500/20 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-all">
              3
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-200 mb-1">Generar y Analizar</p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Pulsa <span className="text-blue-400 font-bold">"Generar Ahora"</span>. El sistema encontrará los perfiles, analizará sus webs y diseñará un mensaje personalizado para cada uno automáticamente.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6">
          <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <p className="text-[10px] uppercase tracking-widest font-bold text-blue-400/60 mb-2">Consejo Premium</p>
            <p className="text-xs text-zinc-400 italic">
              "Para mejores resultados en LinkedIn, procura usar filtros de ubicación exactos en tu criterio de búsqueda."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
