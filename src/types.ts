export type JobSource = "search" | "shortlist" | "manual";
export type CandidateProfileId = string;
export type PlatformFamily =
  | "ashby"
  | "greenhouse"
  | "bamboohr"
  | "lever"
  | "workday"
  | "upwork"
  | "linkedin"
  | "generic";

export type JobStatus =
  | "new"
  | "ready_to_apply"
  | "applied"
  | "needs_manual"
  | "visa_needed"
  | "expired"
  | "rejected_by_rules"
  | "error";

export type JobField =
  | "engineering"
  | "data_science"
  | "data_analytics"
  | "fintech"
  | "crypto"
  | "mining"
  | "project_management"
  | "education_training"
  | "administration";

export interface CandidateProfile {
  name: string;
  headline: string;
  contact: {
    email: string;
    phone: string;
    city: string;
    region: string;
    country: string;
    linkedin: string;
    website: string;
    github: string;
  };
  targetTitles: string[];
  preferredIndustries: string[];
  skills: string[];
  experienceThemes: string[];
  searchLocations: string[];
  workPreferences: {
    remote: boolean;
    hybrid: boolean;
    onsite: boolean;
    relocation: boolean;
  };
  applicationProfile: {
    resumeDirectory: string;
    masterResumePdf: string;
    coverLetterDirectory: string;
    defaultShortPitch: string;
    browserProfileDirectory: string;
    maxAutomaticApplyAttempts: number;
    tailoredResumeThreshold: number;
    alwaysGenerateCoverLetter: boolean;
  };
  scoring: {
    autoApplyThreshold: number;
    titleWeight: number;
    skillsWeight: number;
    industryWeight: number;
    locationWeight: number;
    freshnessWeight: number;
    platformWeight: number;
  };
  exclusions: string[];
}

export interface SearchConfig {
  queries: string[];
  maxResultsPerQuery: number;
}

export interface ApplicationAnswers {
  keywordTextAnswers: Record<string, string>;
  keywordChoiceAnswers: Record<string, string>;
  keywordBooleanAnswers: Record<string, boolean>;
}

export interface DiscoveredJob {
  id: string;
  candidateProfile: CandidateProfileId;
  source: JobSource;
  sourceQuery?: string | undefined;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  currentStatus: string;
  url: string;
  applyUrl: string;
  platform: string;
  platformFamily: PlatformFamily;
  description: string;
  excerpt: string;
  datePosted?: string | undefined;
  lastSeenAt: string;
  cvRequired: boolean;
  notes: string;
}

export interface ScoredJob extends DiscoveredJob {
  score: number;
  scoreReasons: string[];
  fieldTags: JobField[];
  autoApply: boolean;
  selectedCvPdf: string;
  coverLetterRequired: boolean;
  selectedCoverLetterPdf: string;
  status: JobStatus;
}

export interface PersistedJob extends ScoredJob {
  discoveredAt: string;
  appliedAt: string;
  lastError: string;
  applyAttempts: number;
  lastTriedAt: string;
  adapter: string;
}
