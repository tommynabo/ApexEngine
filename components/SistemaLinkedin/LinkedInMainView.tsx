import React, { useState, useMemo } from 'react';
import { SearchSession, Lead } from '../../lib/types';
import { LinkedInCampaign, LinkedInLead } from './types/linkedin';
import { LinkedInCampaignsDashboard } from './LinkedInCampaignsDashboard';
import { LinkedInCampaignDetail } from './LinkedInCampaignDetail';

interface LinkedInMainViewProps {
  history: SearchSession[];
}

// ─── Data mapping ────────────────────────────────────────────────────────────

function sessionToCampaign(session: SearchSession): LinkedInCampaign {
  // Determine status heuristically: sessions older than 24 h → completed
  const ageHours = (Date.now() - session.date.getTime()) / 36e5;
  const status: LinkedInCampaign['status'] = ageHours < 24 ? 'active' : 'completed';
  return {
    id: session.id,
    name: session.query || `Búsqueda del ${session.date.toLocaleDateString('es-ES')}`,
    status,
    created_at: session.date,
    total_leads: session.leads.length,
  };
}

function leadToLinkedInLead(lead: Lead, campaignId: string, sessionDate: Date): LinkedInLead {
  return {
    id: lead.id,
    campaign_id: campaignId,
    name: lead.decisionMaker?.name || lead.companyName || '',
    headline: lead.decisionMaker?.role || '',
    company: lead.companyName || '',
    linkedin_url: lead.decisionMaker?.linkedin || '',
    location: lead.location || '',
    email: lead.decisionMaker?.email || '',
    status: lead.status,
    created_at: sessionDate,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LinkedInMainView({ history }: LinkedInMainViewProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const campaigns = useMemo<LinkedInCampaign[]>(
    () => history.map(sessionToCampaign),
    [history],
  );

  const { activeCampaign, activeLeads } = useMemo(() => {
    if (!selectedCampaignId) return { activeCampaign: null, activeLeads: [] };
    const session = history.find((s) => s.id === selectedCampaignId);
    if (!session) return { activeCampaign: null, activeLeads: [] };
    return {
      activeCampaign: sessionToCampaign(session),
      activeLeads: session.leads.map((l) => leadToLinkedInLead(l, session.id, session.date)),
    };
  }, [selectedCampaignId, history]);

  if (activeCampaign) {
    return (
      <LinkedInCampaignDetail
        campaign={activeCampaign}
        leads={activeLeads}
        onBack={() => setSelectedCampaignId(null)}
      />
    );
  }

  return (
    <LinkedInCampaignsDashboard
      campaigns={campaigns}
      onSelectCampaign={setSelectedCampaignId}
    />
  );
}
