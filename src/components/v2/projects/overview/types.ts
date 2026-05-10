export interface SWOT {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface CompetitorInsight {
  name: string;
  url?: string;
  summary: string;
  positioning: string;
  messagingTone: string;
  keyFeatures: string[];
  weaknesses: string[];
  differentiator: string;
}

export interface ProductAnalysis {
  name: string;
  description: string;
  techStack: string[];
  features: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];
  problemStatement?: string;
  marketOpportunity?: string;
  competitors?: { name: string; url?: string; differentiator: string }[];
  competitorInsights?: CompetitorInsight[];
  businessModel?: string;
  revenueStreams?: string[];
  pricingSuggestion?: string;
  currentStage?: 'idea' | 'mvp' | 'beta' | 'growth' | 'mature';
  swot?: SWOT;
  topRisks?: string[];
  prioritizedNextSteps?: string[];
  nextStepsTaken?: { step: string; taken: boolean; evidence: string }[];
  improvements?: string[];
  gtmStrategy?: string;
  earlyAdopterChannels?: string[];
  growthMetrics?: string[];
  analyzedAt: string;
  overallScore?: number;
}

export interface Project {
  id: string;
  name: string;
  createdBy?: string;
  description?: string;
  path?: string;
  sourceType?: 'codebase' | 'github' | 'description';
  isGithub?: boolean;
  githubUrl?: string;
  lastAnalyzedCommitSha?: string;
  isShared?: boolean;
  logoUrl?: string;
  createdAt: string;
  analysis?: ProductAnalysis;
}
