export type PlatformSource = 'gmail' | 'linkedin';
export type SearchMode = 'fast' | 'deep';
export type PageView = 'login' | 'dashboard' | 'campaigns';

export interface ImmobiliariasConfig {
  targetIndustries: string[];
  companySizes: string[];
  requiredTitles: string[];
  excludeTitles: string[];
  dailyContactLimit: number;
  enableNPLDetection: boolean;
  batchScrapingStrategy: 'provincial' | 'alphabetical' | 'random';
}

export interface ProjectConfig {
  clientId: string;
  clientName: string;
  primaryColor: string;
  targets: {
    icp: string; // Ideal Customer Profile description
    locations: string[];
  };
  enabledPlatforms: PlatformSource[];
  searchSettings: {
    defaultDepth: number;
    defaultMode: SearchMode;
  };
  immobiliariasConfig?: ImmobiliariasConfig;
}

export interface Lead {
  id: string;
  source: PlatformSource;
  companyName: string;
  website?: string;
  socialUrl?: string;
  location?: string;
  decisionMaker?: {
    name: string;
    role: string; // e.g., "Founder", "Owner", "CEO"
    email: string;
    phone?: string;
    linkedin?: string;
    facebook?: string;
    instagram?: string;
  };
  aiAnalysis: {
    summary: string;
    painPoints: string[];
    generatedIcebreaker: string;
    fullMessage: string;
    fullAnalysis: string; // Legacy/Fallback
    psychologicalProfile: string; // New structured field
    businessMoment: string;       // New structured field
    salesAngle: string;           // New structured field
  };
  // New fields for Marcos' messages
  messageA?: string; // Generic automation message
  messageB?: string; // NPL-focused message
  isNPLPotential?: boolean;
  status: 'scraped' | 'enriched' | 'ready' | 'contacted' | 'replied' | 'discarded';
}

export interface AdvancedFilter {
  locations: string[];
  jobTitles: string[];
  companySizes: string[];
  industries: string[];
  keywords: string[];
}

export interface SearchConfigState {
  query: string;
  source: PlatformSource;
  mode: SearchMode;
  maxResults: number;
  advancedFilters?: AdvancedFilter;
}

export interface SearchSession {
  id: string;
  date: Date;
  query: string;
  source: PlatformSource;
  resultsCount: number;
  leads: Lead[];
}
