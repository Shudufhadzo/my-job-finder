import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import type {
  ApplicationAnswers,
  CandidateProfile,
  CandidateProfileId,
  SearchConfig
} from "./types.js";

const rootDir = process.env.MY_JOB_FINDER_ENGINE_HOME?.trim()
  ? path.resolve(process.env.MY_JOB_FINDER_ENGINE_HOME.trim())
  : process.cwd();

const candidateSchema = z.object({
  name: z.string(),
  headline: z.string(),
  contact: z.object({
    email: z.string(),
    phone: z.string(),
    city: z.string(),
    region: z.string(),
    country: z.string(),
    linkedin: z.string(),
    website: z.string(),
    github: z.string()
  }),
  targetTitles: z.array(z.string()),
  preferredIndustries: z.array(z.string()),
  skills: z.array(z.string()),
  experienceThemes: z.array(z.string()),
  searchLocations: z.array(z.string()),
  workPreferences: z.object({
    remote: z.boolean(),
    hybrid: z.boolean(),
    onsite: z.boolean(),
    relocation: z.boolean()
  }),
  applicationProfile: z.object({
    resumeDirectory: z.string(),
    masterResumePdf: z.string(),
    coverLetterDirectory: z.string(),
    defaultShortPitch: z.string(),
    browserProfileDirectory: z.string(),
    maxAutomaticApplyAttempts: z.number().int().positive(),
    tailoredResumeThreshold: z.number().min(0).max(100),
    alwaysGenerateCoverLetter: z.boolean()
  }),
  scoring: z.object({
    autoApplyThreshold: z.number(),
    titleWeight: z.number(),
    skillsWeight: z.number(),
    industryWeight: z.number(),
    locationWeight: z.number(),
    freshnessWeight: z.number(),
    platformWeight: z.number()
  }),
  exclusions: z.array(z.string())
});

const searchConfigSchema = z.object({
  queries: z.array(z.string()),
  maxResultsPerQuery: z.number().int().positive()
});

const applicationAnswersSchema = z.object({
  keywordTextAnswers: z.record(z.string(), z.string()),
  keywordChoiceAnswers: z.record(z.string(), z.string()),
  keywordBooleanAnswers: z.record(z.string(), z.boolean())
});

const candidateProfileIdSchema = z.string().trim().min(1);
const activeCandidateSchema = z.object({
  activeCandidate: candidateProfileIdSchema
});

function readJson<T>(filePath: string, schema: z.ZodType<T>): T {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return schema.parse(parsed);
}

export function getRootDir(): string {
  return rootDir;
}

export function resolveFromRoot(...segments: string[]): string {
  if (segments[0] && path.isAbsolute(segments[0])) {
    return path.join(...segments);
  }
  return path.join(rootDir, ...segments);
}

export function loadActiveCandidateId(): CandidateProfileId {
  return readJson(
    resolveFromRoot("config", "active-candidate.json"),
    activeCandidateSchema
  ).activeCandidate;
}

export function loadCandidateProfile(
  candidateProfile: CandidateProfileId = loadActiveCandidateId()
): CandidateProfile {
  return readJson(
    resolveFromRoot("config", "candidate-profiles", `${candidateProfile}.json`),
    candidateSchema
  );
}

export function loadSearchConfig(
  candidateProfile: CandidateProfileId = loadActiveCandidateId()
): SearchConfig {
  const fileName = `search-queries-${candidateProfile}.json`;
  return readJson(resolveFromRoot("config", fileName), searchConfigSchema);
}

export function loadApplicationAnswers(
  candidateProfile: CandidateProfileId = loadActiveCandidateId()
): ApplicationAnswers {
  const fileName = `application-answers-${candidateProfile}.json`;
  const filePath = resolveFromRoot("config", fileName);
  if (!existsSync(filePath)) {
    return {
      keywordTextAnswers: {},
      keywordChoiceAnswers: {},
      keywordBooleanAnswers: {}
    };
  }
  return readJson(filePath, applicationAnswersSchema);
}
