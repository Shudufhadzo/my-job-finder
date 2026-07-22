import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

import type { CandidateProfile, SearchConfig } from "../types.js";
import { ensureDirectory, slugify } from "../utils.js";
import type { DesktopProfile, DesktopProfileInput } from "./types.js";
import { isReasoningEffort, readCodexModelOptions } from "./codex-models.js";

const profileFileName = "profile.json";

function candidateIdForName(displayName: string): string {
  const normalized = displayName.replace(/\s+/g, " ").trim().toLowerCase();
  const readable = slugify(normalized).slice(0, 36) || "candidate";
  const fingerprint = createHash("sha256").update(normalized).digest("hex").slice(0, 8);
  return `desktop-${readable}-${fingerprint}`;
}

function uniquePreferences(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawValue of values) {
    const value = rawValue.replace(/\s+/g, " ").trim();
    const key = value.toLocaleLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }

  return result;
}

const roleVocabulary = [
  "analyst", "architect", "consultant", "coordinator", "designer", "developer", "educator",
  "engineer", "manager", "marketer", "nurse", "planner", "recruiter", "researcher", "scientist",
  "specialist", "teacher", "technician"
];

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function normalizeRole(value: string): string {
  return value.replace(/[A-Za-z]+/g, (word) => {
    const lowered = word.toLowerCase();
    const correction = roleVocabulary.find((candidate) =>
      candidate !== lowered &&
      Math.abs(candidate.length - lowered.length) <= 2 &&
      editDistance(candidate, lowered) <= 2
    );
    if (!correction) return word;
    return word[0] === word[0]?.toUpperCase()
      ? correction[0]?.toUpperCase() + correction.slice(1)
      : correction;
  });
}

function assertValidTime(value: string): void {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Schedule time must use 24-hour HH:mm format.");
  }
}

export function getDesktopDataRoot(): string {
  if (process.env.MY_JOB_FINDER_HOME?.trim()) {
    return path.resolve(process.env.MY_JOB_FINDER_HOME.trim());
  }

  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "My Job Finder"
    );
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "My Job Finder");
  }

  return path.join(os.homedir(), ".local", "share", "my-job-finder");
}

export function saveDesktopProfile(
  input: DesktopProfileInput,
  dataRoot = getDesktopDataRoot(),
  now = new Date()
): DesktopProfile {
  const displayName = input.displayName.replace(/\s+/g, " ").trim();
  const targetRoles = uniquePreferences(input.targetRoles.map(normalizeRole));
  const locations = uniquePreferences(input.locations);
  const sourceCvPath = path.resolve(input.sourceCvPath);
  const codexOptions = readCodexModelOptions();
  const requestedModel = input.aiModel?.trim();
  const aiModel = requestedModel && codexOptions.models.includes(requestedModel)
    ? requestedModel
    : codexOptions.defaultModel;
  const reasoningEffort = input.reasoningEffort && isReasoningEffort(input.reasoningEffort)
    ? input.reasoningEffort
    : codexOptions.defaultReasoningEffort;
  assertValidTime(input.scheduleTime);

  if (!displayName) {
    throw new Error("Your name is required.");
  }
  if (!existsSync(sourceCvPath)) {
    throw new Error(`The selected CV does not exist: ${sourceCvPath}`);
  }
  if (targetRoles.length === 0) {
    throw new Error("Add at least one target role.");
  }
  if (locations.length === 0) {
    throw new Error("Add at least one preferred location or Remote.");
  }

  const extension = path.extname(sourceCvPath).toLocaleLowerCase() || ".pdf";
  const masterCvPath = path.join(dataRoot, "documents", `master-cv${extension}`);
  const masterCvMarkdownPath = path.join(dataRoot, "documents", "master-cv.md");
  ensureDirectory(masterCvPath);
  if (path.normalize(sourceCvPath) !== path.normalize(masterCvPath)) {
    copyFileSync(sourceCvPath, masterCvPath);
  }

  const existing = loadDesktopProfile(dataRoot);
  const sameCandidate = existing?.displayName.toLocaleLowerCase() === displayName.toLocaleLowerCase();
  const timestamp = now.toISOString();
  const profile: DesktopProfile = {
    version: 1,
    id: sameCandidate ? existing.id : candidateIdForName(displayName),
    displayName,
    masterCvPath,
    masterCvMarkdownPath,
    targetRoles,
    locations,
    scheduleTime: input.scheduleTime,
    scheduleEnabled: input.scheduleEnabled,
    aiModel,
    reasoningEffort,
    createdAt: sameCandidate ? existing.createdAt : timestamp,
    updatedAt: timestamp
  };

  const profilePath = path.join(dataRoot, profileFileName);
  ensureDirectory(profilePath);
  writeFileSync(profilePath, JSON.stringify(profile, null, 2), "utf8");
  return profile;
}

export function loadDesktopProfile(dataRoot = getDesktopDataRoot()): DesktopProfile | null {
  const profilePath = path.join(dataRoot, profileFileName);
  if (!existsSync(profilePath)) {
    return null;
  }

  const stored = JSON.parse(readFileSync(profilePath, "utf8")) as Partial<DesktopProfile> & Pick<DesktopProfile, "displayName" | "masterCvPath" | "targetRoles" | "locations" | "scheduleTime" | "scheduleEnabled" | "createdAt" | "updatedAt">;
  const defaults = readCodexModelOptions();
  return {
    ...stored,
    version: 1,
    id: stored.id?.trim() || candidateIdForName(stored.displayName),
    masterCvMarkdownPath: stored.masterCvMarkdownPath?.trim() || path.join(dataRoot, "documents", "master-cv.md"),
    aiModel: stored.aiModel?.trim() && defaults.models.includes(stored.aiModel.trim())
      ? stored.aiModel.trim()
      : defaults.defaultModel,
    reasoningEffort: stored.reasoningEffort && isReasoningEffort(stored.reasoningEffort)
      ? stored.reasoningEffort
      : defaults.defaultReasoningEffort
  } as DesktopProfile;
}

export function buildCandidateProfile(
  profile: DesktopProfile,
  dataRoot = getDesktopDataRoot()
): CandidateProfile {
  const cvMarkdown = existsSync(profile.masterCvMarkdownPath)
    ? readFileSync(profile.masterCvMarkdownPath, "utf8")
    : "";
  const searchableCv = cvMarkdown.toLowerCase();
  const skillCatalogue = [
    "Python", "SQL", "R", "Power BI", "Tableau", "Excel", "Machine Learning", "Data Science",
    "Data Analysis", "Project Management", "Programme Management", "Stakeholder Management", "Teaching",
    "Curriculum Development", "Reporting", "Budgeting", "Risk Management", "Financial Analysis", "Java",
    "JavaScript", "TypeScript", "React", "Azure", "AWS", "Google Cloud", "Databricks", "Spark", "dbt",
    "Airflow", "Statistics", "Forecasting", "Business Intelligence", "Electrical Engineering", "Maintenance",
    "SCADA", "PLC", "Instrumentation", "Operations", "Leadership", "Research", "Communication"
  ];
  const detectedSkills = skillCatalogue.filter((skill) => searchableCv.includes(skill.toLowerCase()));
  const industryCatalogue = ["mining", "fintech", "banking", "insurance", "education", "technology", "healthcare", "retail", "manufacturing", "energy", "crypto", "web3"];
  const detectedIndustries = industryCatalogue.filter((industry) => searchableCv.includes(industry));
  const experienceThemes = cvMarkdown
    .split(/\n+/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter((line) => line.length >= 30 && line.length <= 180)
    .slice(0, 20);
  return {
    name: profile.displayName,
    headline: profile.targetRoles.join(" | "),
    contact: {
      email: "",
      phone: "",
      city: "",
      region: "",
      country: "",
      linkedin: "",
      website: "",
      github: ""
    },
    targetTitles: profile.targetRoles,
    preferredIndustries: detectedIndustries,
    skills: uniquePreferences([...profile.targetRoles, ...detectedSkills]),
    experienceThemes,
    searchLocations: profile.locations,
    workPreferences: {
      remote: profile.locations.some((value) => /remote/i.test(value)),
      hybrid: true,
      onsite: true,
      relocation: false
    },
    applicationProfile: {
      resumeDirectory: path.join(dataRoot, "documents", "applications", "cvs"),
      masterResumePdf: profile.masterCvPath,
      coverLetterDirectory: path.join(dataRoot, "documents", "applications", "cover-letters"),
      defaultShortPitch: `I am interested in ${profile.targetRoles.join(", ")} opportunities.`,
      browserProfileDirectory: path.join(dataRoot, "browser-profile"),
      maxAutomaticApplyAttempts: 1,
      tailoredResumeThreshold: 50,
      alwaysGenerateCoverLetter: true
    },
    scoring: {
      autoApplyThreshold: 60,
      titleWeight: 38,
      skillsWeight: 20,
      industryWeight: 8,
      locationWeight: 14,
      freshnessWeight: 12,
      platformWeight: 8
    },
    exclusions: ["commission only", "unpaid", "training fee", "registration fee"]
  };
}

export function buildSearchConfig(profile: DesktopProfile): SearchConfig {
  const queries = profile.targetRoles.flatMap((role) =>
    profile.locations.map((location) => `"${role}" ${location === "Remote" ? "Remote" : `"${location}"`} jobs`)
  );

  return {
    queries: uniquePreferences(queries).slice(0, 40),
    maxResultsPerQuery: 20
  };
}

export function writeEngineConfiguration(
  profile: DesktopProfile,
  workspaceRoot: string,
  dataRoot = getDesktopDataRoot()
): void {
  const candidatePath = path.join(workspaceRoot, "config", "candidate-profiles", `${profile.id}.json`);
  const searchPath = path.join(workspaceRoot, "config", `search-queries-${profile.id}.json`);
  const activePath = path.join(workspaceRoot, "config", "active-candidate.json");
  ensureDirectory(candidatePath);
  writeFileSync(candidatePath, JSON.stringify(buildCandidateProfile(profile, dataRoot), null, 2), "utf8");
  writeFileSync(searchPath, JSON.stringify(buildSearchConfig(profile), null, 2), "utf8");
  writeFileSync(activePath, JSON.stringify({ activeCandidate: profile.id }, null, 2), "utf8");
}

export function computeNextRun(
  scheduleTime: string,
  now = new Date(),
  timezoneOffsetMinutes = -now.getTimezoneOffset()
): Date {
  assertValidTime(scheduleTime);
  const [hours = 0, minutes = 0] = scheduleTime.split(":").map(Number);
  const localNow = new Date(now.getTime() + timezoneOffsetMinutes * 60_000);
  let localTargetMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    hours,
    minutes,
    0,
    0
  );
  let targetUtcMs = localTargetMs - timezoneOffsetMinutes * 60_000;

  if (targetUtcMs <= now.getTime()) {
    localTargetMs += 24 * 60 * 60 * 1000;
    targetUtcMs = localTargetMs - timezoneOffsetMinutes * 60_000;
  }

  return new Date(targetUtcMs);
}

export function profileSlug(profile: DesktopProfile): string {
  return slugify(profile.displayName) || profile.id;
}
