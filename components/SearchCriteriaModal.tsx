import React, { useState } from 'react';
import { X } from 'lucide-react';
import { AdvancedSearchForm } from './SearchFilter/AdvancedSearchForm';

interface SearchCriteriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentQuery: string;
  onSave: (newQuery: string) => void;
}

export function SearchCriteriaModal({
  isOpen,
  onClose,
  currentQuery,
  onSave
}: SearchCriteriaModalProps) {
  const [query, setQuery] = useState(currentQuery);
  const [activeTab, setActiveTab] = useState<'simple' | 'advanced'>('advanced');

  const handleSave = () => {
    if (query.trim()) {
      onSave(query);
      onClose();
    }
  };

  const handleCancel = () => {
    setQuery(currentQuery);
    onClose();
  };

  const handleAdvancedApply = (newQuery: string) => {
    setQuery(newQuery);
    setActiveTab('simple');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto">
        
        {/* Header */}
        <div className="border-b border-zinc-800 p-6 flex items-center justify-between sticky top-0 bg-zinc-900/95 z-10">
          <div>
            <h2 className="text-2xl font-bold text-white">Criterio de Búsqueda</h2>
            <p className="text-sm text-zinc-400 mt-1">Personaliza tu estrategia de prospección</p>
          </div>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-zinc-800 px-6 flex gap-4 bg-zinc-900/50 sticky top-20 z-10">
          <button
            onClick={() => setActiveTab('advanced')}
            className={`py-4 px-2 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'advanced'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-300'
            }`}
          >
            🎯 Búsqueda Avanzada
          </button>
          <button
            onClick={() => setActiveTab('simple')}
            className={`py-4 px-2 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'simple'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-300'
            }`}
          >
            ✏️ Editar Manualmente
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'advanced' ? (
            // Advanced Search Form
            <AdvancedSearchForm
              onApply={handleAdvancedApply}
              onCancel={handleCancel}
            />
          ) : (
            // Simple Query Editor
            <div className="space-y-6">
              {/* Query Textarea */}
              <div>
                <label className="block text-sm font-bold text-zinc-300 mb-3 uppercase tracking-wider">
                  Consulta de Búsqueda
                </label>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Ej: ("Gym" OR "Fitness") AND ("Dueño" OR "Fundador")'
                  className="w-full h-32 bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none transition-colors resize-none font-mono text-sm"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  Usa comillas para términos exactos, AND para todos los términos, OR para alternativas.
                </p>
              </div>

              {/* Operators Help */}
              <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4 space-y-3">
                <h3 className="font-bold text-sm text-zinc-300 uppercase tracking-wider">Operadores Booleanos</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <code className="text-green-400 font-mono">AND</code>
                    <p className="text-zinc-400 mt-1">Todos los términos deben estar presentes</p>
                  </div>
                  <div>
                    <code className="text-blue-400 font-mono">OR</code>
                    <p className="text-zinc-400 mt-1">Al menos uno de los términos debe estar</p>
                  </div>
                  <div>
                    <code className="text-purple-400 font-mono">"Texto"</code>
                    <p className="text-zinc-400 mt-1">Búsqueda de frase exacta</p>
                  </div>
                </div>
              </div>

              {/* Examples */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-2">
                <h3 className="font-bold text-sm text-blue-300">Ejemplos de Consultas</h3>
                <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
                  <li><code className="text-blue-400">("Clínica de Salud" OR "Fitness") AND ("Dueño" OR "Fundador")</code></li>
                  <li><code className="text-blue-400">"Yoga Studio" AND ("Propietario" OR "CEO")</code></li>
                  <li><code className="text-blue-400">Gimnasio AND "Personal Trainer"</code></li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-zinc-800 p-6 flex gap-3 justify-end sticky bottom-0 bg-zinc-900/95">
          <button
            onClick={handleCancel}
            className="px-6 py-2 rounded-lg font-bold text-sm bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-lg font-bold text-sm bg-blue-500 text-white hover:bg-blue-600 transition-all flex items-center gap-2"
          >
            ✓ Guardar
          </button>
        </div>

      </div>
    </div>
  );
}
