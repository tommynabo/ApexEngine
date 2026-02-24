import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Wand2, Loader2 } from 'lucide-react';
import { Lead } from '../lib/types';

interface MessageModalProps {
   lead: Lead | null;
   onClose: () => void;
   onApprove?: (lead: Lead, message: string) => void;
}

const generateMessage = async (lead: Lead): Promise<string> => {
   const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

   if (!apiKey) {
      return `Hola${lead.decisionMaker?.name ? ` ${lead.decisionMaker.name}` : ''},

He visto que ${lead.companyName} está en ${lead.location || 'vuestra zona'} y me ha parecido muy interesante lo que hacéis.

${lead.aiAnalysis?.summary || ''}

Me encantaría poder comentar cómo podríamos colaborar. ¿Tendríais disponibilidad para una breve llamada esta semana?

Un saludo`;
   }

   try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
         },
         body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
               {
                  role: 'system',
                  content: `Eres un experto en copywriting de emails de ventas B2B en español. 
Genera emails cortos, personalizados y con alto ratio de respuesta.
- Máximo 100 palabras
- Tono profesional pero cercano
- Un solo CTA claro
- Personalizado con datos del lead`
               },
               {
                  role: 'user',
                  content: `Genera un email de outreach para:
Empresa: ${lead.companyName}
Decisor: ${lead.decisionMaker?.name || 'Propietario'}
Cargo: ${lead.decisionMaker?.role || 'N/A'}
Ubicación: ${lead.location || 'España'}
Info: ${lead.aiAnalysis?.summary || 'Empresa del sector'}`
               }
            ],
            temperature: 0.7,
            max_tokens: 300
         })
      });

      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'Error generando mensaje';
   } catch (error) {
      console.error('Error generating message:', error);
      return 'Error al generar el mensaje. Por favor, escribe manualmente.';
   }
};

export function MessageModal({ lead, onClose, onApprove }: MessageModalProps) {
   const [copied, setCopied] = useState(false);
   const [message, setMessage] = useState('');
   const [isGenerating, setIsGenerating] = useState(false);
   const [approved, setApproved] = useState(false);

   useEffect(() => {
      if (lead) {
         // If the lead already has a message, use it
         if (lead.aiAnalysis?.fullMessage) {
            setMessage(lead.aiAnalysis.fullMessage);
         } else {
            // Otherwise, generate one
            setIsGenerating(true);
            generateMessage(lead).then(msg => {
               setMessage(msg);
               setIsGenerating(false);
            });
         }
      }
   }, [lead]);

   if (!lead) return null;

   const handleCopy = () => {
      navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
   };

   const handleApprove = () => {
      // Update the lead with the message for CSV export
      lead.aiAnalysis.fullMessage = message;
      lead.status = 'ready';
      setApproved(true);

      if (onApprove) {
         onApprove(lead, message);
      }

      setTimeout(() => {
         onClose();
      }, 1000);
   };

   return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
         <div className="bg-card border border-border w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden animate-[scaleIn_0.2s_ease-out]">

            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-secondary/30">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                     <Wand2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                     <h3 className="font-semibold text-foreground">Borrador de Mensaje IA</h3>
                     <p className="text-xs text-muted-foreground">
                        Destinatario: {lead.decisionMaker?.name || 'Contacto'} @ {lead.companyName}
                     </p>
                  </div>
               </div>
               <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>

            {/* Content */}
            <div className="p-6 grid gap-6">
               {/* Lead Info Summary - Solo para sources no-LinkedIn */}
               {lead.source !== 'linkedin' && (
                  <div className="bg-secondary/20 p-4 rounded-lg border border-border/50">
                     <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Información del Lead</h4>
                     <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground">{lead.decisionMaker?.email || 'No disponible'}</span></div>
                        <div><span className="text-muted-foreground">Teléfono:</span> <span className="text-foreground">{lead.decisionMaker?.phone || 'No disponible'}</span></div>
                        <div><span className="text-muted-foreground">Web:</span> <span className="text-foreground">{lead.website || 'No disponible'}</span></div>
                        <div><span className="text-muted-foreground">Ubicación:</span> <span className="text-foreground">{lead.location || 'No disponible'}</span></div>
                     </div>
                  </div>
               )}

               {/* Psychological Profile & Deep Analysis - STRUCTURED VIEW */}
               {(lead.aiAnalysis?.psychologicalProfile || lead.aiAnalysis?.fullAnalysis) && (
                  <div className="space-y-3">
                     <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary uppercase tracking-wide">🧠 Deep Research & Psicología</span>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Profile */}
                        <div className="bg-zinc-800/50 p-3 rounded-lg border border-indigo-500/20 hover:border-indigo-500/40 transition-colors">
                           <div className="flex items-center gap-2 mb-2 text-indigo-400">
                              <Wand2 className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase">Perfil Psicológico</span>
                           </div>
                           <p className="text-xs text-zinc-300 leading-snug">
                              {lead.aiAnalysis?.psychologicalProfile || "Análisis en curso..."}
                           </p>
                        </div>

                        {/* Business Moment */}
                        <div className="bg-zinc-800/50 p-3 rounded-lg border border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
                           <div className="flex items-center gap-2 mb-2 text-emerald-400">
                              <Check className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase">Momento Empresarial</span>
                           </div>
                           <p className="text-xs text-zinc-300 leading-snug">
                              {lead.aiAnalysis?.businessMoment || "Analizando..."}
                           </p>
                        </div>

                        {/* Sales Angle */}
                        <div className="bg-zinc-800/50 p-3 rounded-lg border border-amber-500/20 hover:border-amber-500/40 transition-colors">
                           <div className="flex items-center gap-2 mb-2 text-amber-400">
                              <Loader2 className="w-3.5 h-3.5" /> {/* Reusing loader icon as 'Target' for now */}
                              <span className="text-[10px] font-bold uppercase">Ángulo de Venta</span>
                           </div>
                           <p className="text-xs text-zinc-300 leading-snug">
                              {lead.aiAnalysis?.salesAngle || "Generando estrategia..."}
                           </p>
                        </div>
                     </div>

                     {/* Fallback for legacy full text if structured fields are empty but fullAnalysis exists */}
                     {!lead.aiAnalysis?.psychologicalProfile && lead.aiAnalysis?.fullAnalysis && (
                        <div className="p-3 bg-zinc-800/30 rounded-lg text-xs text-zinc-400">
                           {lead.aiAnalysis.fullAnalysis}
                        </div>
                     )}
                  </div>
               )}

               {/* Message Body */}
               <div className="relative">
                  <div className="absolute top-0 right-0 p-2 z-10">
                     <button
                        onClick={handleCopy}
                        disabled={isGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-background border border-border rounded-md text-xs font-medium hover:text-primary transition-all shadow-sm disabled:opacity-50"
                     >
                        {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copiado' : 'Copiar Texto'}
                     </button>
                  </div>

                  {isGenerating ? (
                     <div className="w-full h-64 bg-secondary/30 border border-input rounded-lg flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                           <Loader2 className="w-8 h-8 text-primary animate-spin" />
                           <span className="text-sm text-muted-foreground">Generando mensaje personalizado...</span>
                        </div>
                     </div>
                  ) : (
                     <textarea
                        className="w-full h-64 bg-zinc-900 border border-zinc-700 rounded-lg p-5 font-sans text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="El mensaje se generará automáticamente..."
                     />
                  )}
               </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border bg-secondary/30 flex justify-end gap-3">
               <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
               >
                  Descartar
               </button>
               <button
                  onClick={handleApprove}
                  disabled={isGenerating || approved}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all shadow-lg ${approved
                     ? 'bg-green-500 text-white'
                     : 'bg-primary text-primary-foreground hover:brightness-110 shadow-primary/20'
                     } disabled:opacity-50`}
               >
                  {approved ? (
                     <span className="flex items-center gap-2">
                        <Check className="w-4 h-4" /> Guardado
                     </span>
                  ) : (
                     'Aceptar y Guardar'
                  )}
               </button>
            </div>
         </div>
      </div>
   );
}
