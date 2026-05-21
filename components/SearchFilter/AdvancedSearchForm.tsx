import React, { useState } from 'react';
import { AutocompleteField } from './AutocompleteField';
import { LOCATIONS, JOB_TITLES, COMPANY_SIZES, INDUSTRIES, KEYWORDS, ICP_PRESETS, IcpPreset } from '../../lib/searchFilterData';
import { AdvancedFilter } from '../../lib/types';
import { MapPin, Briefcase, Building2, Layers, Sparkles } from 'lucide-react';

interface AdvancedSearchFormProps {
  onApply: (data: { query: string; filters: AdvancedFilter; icp_type?: 'agency' | 'skool_creator' | 'other' }) => void;
  onCancel: () => void;
}

export function AdvancedSearchForm({ onApply, onCancel }: AdvancedSearchFormProps) {
  const [locations, setLocations] = useState<string[]>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selectedIcp, setSelectedIcp] = useState<IcpPreset['id'] | null>(null);

  const applyPreset = (preset: IcpPreset) => {
    setKeywords(preset.keywords);
    setJobTitles(preset.jobTitles);
    setLocations([]);
    setCompanySizes([]);
    setIndustries([]);
    setSelectedIcp(preset.id);
  };

  /**
   * Build Boolean Query from selected criteria
   * Logic:
   * - Within each category, use OR (alternative options)
   * - Between categories, use AND (all must match)
   */
  const buildQuery = (): string => {
    const parts: string[] = [];

    // Locations - treated as OR within category
    if (locations.length > 0) {
      const locPart = locations.map((loc) => `"${loc}"`).join(' OR ');
      parts.push(`(${locPart})`);
    }

    // Job Titles - treated as OR within category
    if (jobTitles.length > 0) {
      const jobPart = jobTitles.map((job) => `"${job}"`).join(' OR ');
      parts.push(`(${jobPart})`);
    }

    // Company Sizes - treated as OR within category
    if (companySizes.length > 0) {
      const sizePart = companySizes.map((size) => {
        // Handle size ranges
        if (size === 'startup') return '"1-50 employees"';
        if (size === 'small') return '"1-100 employees"';
        if (size === 'medium') return '"100-1000 employees"';
        if (size === 'large') return '"1000+ employees"';
        return `"${size}"`;
      }).join(' OR ');
      parts.push(`(${sizePart})`);
    }

    // Industries - treated as OR within category
    if (industries.length > 0) {
      const indPart = industries.map((ind) => `"${ind}"`).join(' OR ');
      parts.push(`(${indPart})`);
    }

    // Keywords - treated as OR within category
    if (keywords.length > 0) {
      const keyPart = keywords.map((key) => `"${key}"`).join(' OR ');
      parts.push(`(${keyPart})`);
    }

    // If nothing selected, return empty string
    if (parts.length === 0) {
      return '';
    }

    // Join all parts with AND
    return parts.join(' AND ');
  };

  const handleApply = () => {
    const query = buildQuery();
    if (query.trim()) {
      onApply({
        query,
        filters: {
          locations,
          jobTitles,
          companySizes,
          industries,
          keywords
        },
        icp_type: selectedIcp ?? 'other'
      });
    }
  };

  const hasSelections = () => {
    return (
      locations.length > 0 ||
      jobTitles.length > 0 ||
      companySizes.length > 0 ||
      industries.length > 0 ||
      keywords.length > 0
    );
  };

  const resetForm = () => {
    setLocations([]);
    setJobTitles([]);
    setCompanySizes([]);
    setIndustries([]);
    setKeywords([]);
    setSelectedIcp(null);
  };

  return (
    <div className="space-y-6">
      {/* ICP Presets */}
      <div>
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">⚡ Presets ICP</p>
        <div className="grid grid-cols-2 gap-3">
          {ICP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-all ${
                selectedIcp === preset.id
                  ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                  : 'bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:border-blue-500/50 hover:bg-zinc-800'
              }`}
            >
              <span className="text-base font-bold">{preset.emoji} {preset.label}</span>
              <span className="text-xs text-zinc-400 leading-snug">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <h3 className="text-lg font-bold text-white mb-1">Búsqueda Avanzada</h3>
        <p className="text-sm text-zinc-400">
          Define múltiples criterios para refinar tu búsqueda. Todos los criterios se combinan con AND lógico.
        </p>
      </div>

      {/* Form Fields */}
      <div className="space-y-6 bg-zinc-800/20 border border-zinc-700/50 rounded-lg p-6">
        <AutocompleteField
          label="Ubicación"
          placeholder="Busca ciudades o regiones..."
          options={LOCATIONS}
          selectedValues={locations}
          onChange={setLocations}
          icon={<MapPin className="w-4 h-4" />}
        />

        <AutocompleteField
          label="Cargo (Job Title)"
          placeholder="Busca puestos de trabajo..."
          options={JOB_TITLES}
          selectedValues={jobTitles}
          onChange={setJobTitles}
          icon={<Briefcase className="w-4 h-4" />}
        />

        <AutocompleteField
          label="Tamaño Empresa"
          placeholder="Busca tamaños de empresa..."
          options={COMPANY_SIZES}
          selectedValues={companySizes}
          onChange={setCompanySizes}
          icon={<Building2 className="w-4 h-4" />}
        />

        <AutocompleteField
          label="Sector / Industry"
          placeholder="Busca sectores..."
          options={INDUSTRIES}
          selectedValues={industries}
          onChange={setIndustries}
          icon={<Layers className="w-4 h-4" />}
        />

        <AutocompleteField
          label="Palabras Clave Empresa"
          placeholder="Busca keywords..."
          options={KEYWORDS}
          selectedValues={keywords}
          onChange={setKeywords}
          icon={<Sparkles className="w-4 h-4" />}
        />
      </div>

      {/* Query Preview */}
      {hasSelections() && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <p className="text-xs font-bold text-blue-300 mb-2 uppercase tracking-wider">
            Consulta Generada:
          </p>
          <div className="bg-zinc-900 border border-blue-500/20 rounded p-3">
            <code className="text-xs text-blue-300 font-mono break-words">
              {buildQuery()}
            </code>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4 text-xs text-zinc-400 space-y-2">
        <p>
          <span className="text-zinc-300 font-semibold">💡 Tip:</span> Los criterios dentro de una categoría se
          combinan con OR (cualquiera), y entre categorías con AND (todos).
        </p>
        <p>
          <span className="text-zinc-300 font-semibold">📝 Ejemplo:</span> Si seleccionas "Madrid" y
          "Barcelona" en Ubicación, y "CEO" en Cargo, buscarás CEOs en Madrid O Barcelona.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t border-zinc-700">
        <button
          onClick={resetForm}
          className="px-6 py-2 rounded-lg font-bold text-sm bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
        >
          Limpiar
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-2 rounded-lg font-bold text-sm bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
        >
          Cancelar
        </button>
        <button
          onClick={handleApply}
          disabled={!hasSelections()}
          className="px-6 py-2 rounded-lg font-bold text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:bg-zinc-700 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          ✓ Aplicar Búsqueda
        </button>
      </div>
    </div>
  );
}
