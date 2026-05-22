export type LinkedInCampaignStatus = 'active' | 'completed' | 'paused';

export interface LinkedInCampaign {
  id: string;
  name: string;
  status: LinkedInCampaignStatus;
  created_at: Date;
  total_leads: number;
}

export interface LinkedInLead {
  id: string;
  campaign_id: string;
  name: string;
  headline: string;
  company: string;
  linkedin_url: string;
  location: string;
  email: string;
  status: 'scraped' | 'enriched' | 'ready' | 'contacted' | 'replied' | 'discarded';
}
