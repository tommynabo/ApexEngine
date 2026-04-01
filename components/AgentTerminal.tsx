import React, { useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';

interface AgentTerminalProps {
  logs: string[];
  isVisible: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function AgentTerminal({ logs, isVisible, isExpanded, onToggleExpand }: AgentTerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  if (!isVisible) return null;

  return (
    <div className={`mt-6 border border-border rounded-xl overflow-hidden shadow-2xl transition-all duration-500 ease-in-out ${isExpanded ? 'bg-black' : 'bg-card'}`}>
      {/* Terminal Header */}
      <div 
        className="bg-secondary/30 backdrop-blur-sm px-4 py-2 border-b border-white/5 flex items-center justify-between cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-xs font-mono font-medium text-muted-foreground">
            APEX_ENGINE_V1.0 <span className="text-primary mx-2">●</span> EJECUCIÓN EN VIVO
          </span>
        </div>
        <button className="text-muted-foreground hover:text-foreground">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Terminal Content */}
      <div className={`transition-all duration-300 ${isExpanded ? 'h-64' : 'h-0'}`}>
        <div className="h-full overflow-y-auto p-4 font-mono text-xs md:text-sm space-y-1.5 scrollbar-hide">
          {logs.map((log, index) => {
            // Style logs based on content
            const isError = log.includes('Error') || log.includes('Fallo');
            const isSuccess = log.includes('Encontrado') || log.includes('Identificado') || log.includes('Redactado') || log.includes('COMPLETO');
            const isSystem = log.includes('[AGENTE]');
            
            return (
              <div key={index} className="flex gap-3 opacity-0 animate-[fadeIn_0.3s_ease-out_forwards]">
                <span className="text-muted-foreground min-w-[80px]">
                  {new Date().toLocaleTimeString('es-ES', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className={
                  isError ? 'text-destructive' :
                  isSuccess ? 'text-green-400' :
                  isSystem ? 'text-primary' : 'text-zinc-300'
                }>
                  {log}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
          
          <div className="flex items-center gap-2 text-primary/50 mt-2">
            <span className="animate-pulse">_</span>
          </div>
        </div>
      </div>
    </div>
  );
}