import type { CandidateProfile, PersistedJob, SearchConfig } from "../types.js";

export interface DesktopProfileInput {
  displayName: string;
  sourceCvPath: string;
  targetRoles: string[];
  locations: string[];
  scheduleTime: string;
  scheduleEnabled: boolean;
  aiModel?: string;
  reasoningEffort?: CodexInvocationOptions["reasoningEffort"];
}

export interface DesktopProfile {
  version: 1;
  id: string;
  displayName: string;
  masterCvPath: string;
  masterCvMarkdownPath: string;
  targetRoles: string[];
  locations: string[];
  scheduleTime: string;
  scheduleEnabled: boolean;
  aiModel: string;
  reasoningEffort: CodexInvocationOptions["reasoningEffort"];
  createdAt: string;
  updatedAt: string;
}

export interface DesktopState {
  profile: DesktopProfile | null;
  jobs: PersistedJob[];
  nextRunAt: string;
  generatedAt: string;
  availableModels: string[];
  availableReasoningEfforts: CodexInvocationOptions["reasoningEffort"][];
}

export interface CodexInvocationOptions {
  platform: NodeJS.Platform;
  executable: string;
  schemaPath: string;
  outputPath: string;
  model: string;
  reasoningEffort: "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface ProcessInvocation {
  file: string;
  args: string[];
}

export type DesktopCandidateProfile = CandidateProfile;
export type DesktopSearchConfig = SearchConfig;
