import React, { useState } from 'react';
import { Play, Zap, Clock, Calendar } from 'lucide-react';
import { SearchConfigState } from '../lib/types';
import { PROJECT_CONFIG } from '../config/project';
import { ICP_PRESETS } from '../lib/searchFilterData';

interface SearchConfigProps {
  config: SearchConfigState;
  onChange: (updates: Partial<SearchConfigState>) => void;
  onSearch: () => void;
  isSearching: boolean;
  onOpenCriteria?: () => void;
  totalLeadsGenerated: number;
  hidePresets?: boolean;
}

export function SearchConfig({
  config,
  onChange,
  onSearch,
  onStop,
  isSearching,
  onOpenCriteria,
  totalLeadsGenerated,
  hidePresets,
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
    <div className="grid grid-cols-1 gap-6 items-start">
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
            {/* ICP Quick Presets */}
            {!hidePresets && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">⚡ Presets ICP</p>
              <div className="grid grid-cols-2 gap-2">
                {ICP_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() =>
                      onChange({
                        query: preset.query,
                        icp_type: preset.id,
                        advancedFilters: {
                          locations: [],
                          jobTitles: preset.jobTitles,
                          companySizes: [],
                          industries: [],
                          keywords: preset.keywords,
                        },
                      })
                    }
                    disabled={isSearching}
                    title={preset.description}
                    className={`flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold py-2 px-3 transition-all border disabled:opacity-50 ${
                      config.icp_type === preset.id
                        ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                        : 'bg-secondary/40 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    <span>{preset.emoji}</span>
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
            )}

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
    </div>
  );
}
