import type { PersistedJob } from "../types.js";
import { runCodexJson } from "./local-codex.js";
import type { DesktopProfile } from "./types.js";

export interface AiJobMatch {
  jobId: string;
  score: number;
  summary: string;
}

const rankingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          jobId: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          summary: { type: "string" }
        },
        required: ["jobId", "score", "summary"]
      }
    }
  },
  required: ["matches"]
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function applyMatchScores(
  jobs: PersistedJob[],
  matches: AiJobMatch[],
  autoApplyThreshold: number,
  label: "AI CV match" | "Local CV match"
): PersistedJob[] {
  const byId = new Map(matches.map((match) => [match.jobId, match]));
  return jobs.map((job) => {
    const match = byId.get(job.id);
    if (!match || job.status === "expired" || job.status === "rejected_by_rules") return job;

    const score = clampScore(match.score);
    const canChangeStatus = job.status === "new" || job.status === "ready_to_apply" || job.status === "error";
    return {
      ...job,
      score,
      scoreReasons: [
        ...job.scoreReasons.filter((reason) => !/^(?:AI|Local) CV match:/.test(reason)),
        `${label}: ${score}% - ${match.summary}`
      ],
      autoApply: canChangeStatus && score >= autoApplyThreshold && Boolean(job.applyUrl),
      status: canChangeStatus
        ? score >= autoApplyThreshold && job.applyUrl ? "ready_to_apply" : "new"
        : job.status,
      lastError: canChangeStatus ? "" : job.lastError
    };
  });
}

export function applyAiMatchScores(
  jobs: PersistedJob[],
  matches: AiJobMatch[],
  autoApplyThreshold: number
): PersistedJob[] {
  return applyMatchScores(jobs, matches, autoApplyThreshold, "AI CV match");
}

const stopWords = new Set([
  "about", "after", "also", "and", "are", "been", "being", "build", "company", "from",
  "have", "into", "job", "more", "other", "role", "that", "the", "their", "this", "using",
  "what", "when", "where", "which", "will", "with", "work", "years", "your"
]);

function tokens(value: string): Set<string> {
  return new Set(value
    .toLowerCase()
    .replace(/co[-\s]?ordinator/g, "coordinator")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token)));
}

const occupationTerms = new Set([
  "accountant", "administrator", "analyst", "architect", "artisan", "assistant", "auditor",
  "capturer", "clerk", "consultant", "coordinator", "designer", "developer", "director", "educator",
  "electrician", "engineer", "executive", "facilitator", "foreman", "lecturer", "manager", "master",
  "mechanic", "model", "nurse", "officer", "owner", "partner", "planner", "recruiter", "researcher",
  "scientist", "specialist", "supervisor", "teacher", "technician", "trainer"
]);
const ambiguousOccupationTerms = new Set(["master", "model", "owner", "partner"]);

function roleTerms(value: string): Set<string> {
  return new Set([...tokens(value)].filter((token) => occupationTerms.has(token)));
}

type RoleFamily = "administration" | "data" | "education" | "engineering" | "finance" | "project";

function roleFamilies(value: string): Set<RoleFamily> {
  const valueTokens = tokens(value);
  const roles = roleTerms(value);
  const families = new Set<RoleFamily>();

  if (["capturer", "clerk", "administrator"].some((role) => roles.has(role))) {
    families.add("administration");
    return families;
  }
  if (
    ["analyst", "scientist"].some((role) => roles.has(role)) ||
    (valueTokens.has("data") && ["analytics", "science", "intelligence", "quantitative", "decision"].some((term) => valueTokens.has(term)))
  ) families.add("data");
  if (["architect", "developer", "electrician", "engineer", "technician"].some((role) => roles.has(role))) families.add("engineering");
  if (["coordinator", "manager", "planner", "supervisor"].some((role) => roles.has(role))) families.add("project");
  if (["educator", "facilitator", "lecturer", "teacher", "trainer"].some((role) => roles.has(role))) families.add("education");
  if (["accountant", "auditor"].some((role) => roles.has(role))) families.add("finance");
  return families;
}

function intersects<T>(left: Set<T>, right: Set<T>): boolean {
  return [...left].some((value) => right.has(value));
}

function overlap(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((token) => right.has(token));
}

export function rankJobsLocally(
  profile: DesktopProfile,
  jobs: PersistedJob[],
  cvMarkdown: string
): PersistedJob[] {
  const cvTokens = tokens(cvMarkdown);
  const targetRoleTerms = roleTerms(profile.targetRoles.join(" "));
  const targetFamilies = roleFamilies(profile.targetRoles.join(" "));
  const cvFamilies = roleFamilies(cvMarkdown);
  const preferredLocations = profile.locations.map((location) => location.toLowerCase());
  const matches = jobs
    .filter((job) => job.candidateProfile === profile.id)
    .map((job) => {
      const jobRoleTerms = roleTerms(job.title);
      const jobFamilies = roleFamilies(job.title);
      const jobTokens = tokens(`${job.title} ${job.description || job.excerpt}`);
      const evidence = overlap(jobTokens, cvTokens);
      const directRoleOverlap = overlap(jobRoleTerms, targetRoleTerms);
      const cvRoleOverlap = overlap(jobRoleTerms, cvTokens)
        .filter((token) => !ambiguousOccupationTerms.has(token));
      const exactTarget = profile.targetRoles.some((role) => job.title.toLowerCase().includes(role.toLowerCase()));
      const roleAlignment = exactTarget
        ? 1
        : directRoleOverlap.length > 0
          ? 0.85
          : intersects(jobFamilies, targetFamilies)
            ? 0.75
            : intersects(jobFamilies, cvFamilies)
              ? 0.6
              : cvRoleOverlap.length > 0
                ? 0.55
                : 0;
      const evidenceRatio = evidence.length / Math.max(1, Math.min(45, jobTokens.size));
      const locationFit = preferredLocations.some((location) =>
        location === "remote"
          ? /remote/i.test(job.location)
          : job.location.toLowerCase().includes(location)
      );
      let score = clampScore(
        5 +
        roleAlignment * 40 +
        Math.min(30, evidenceRatio * 30) +
        (locationFit ? 10 : 0) +
        (exactTarget ? 5 : 0)
      );
      const intentionallyDifferentRole = ["capturer", "clerk", "model"].some((role) =>
        jobRoleTerms.has(role) && !targetRoleTerms.has(role)
      );
      if (roleAlignment === 0 || intentionallyDifferentRole) score = Math.min(score, 45);
      score = Math.min(score, 92);
      const strongest = evidence.slice(0, 5);
      return {
        jobId: job.id,
        score,
        summary: strongest.length > 0
          ? `CV evidence overlaps on ${strongest.join(", ")}; verify role-specific requirements manually.`
          : "Limited direct CV evidence; review transferable experience and mandatory requirements manually."
      };
    });

  return applyMatchScores(jobs, matches, 60, "Local CV match");
}

function rankingPrompt(profile: DesktopProfile, cvMarkdown: string, jobs: PersistedJob[]): string {
  const jobPayload = jobs.map((job) => ({
    jobId: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    employmentType: job.employmentType,
    description: job.description || job.excerpt
  }));
  return `You rank job fit for My Job Finder.

Candidate interests: ${profile.targetRoles.join(", ")}
Preferred locations: ${profile.locations.join(", ")}

MASTER CV MARKDOWN
${cvMarkdown}

JOBS
${JSON.stringify(jobPayload, null, 2)}

Return one match for every supplied jobId. Score 0 to 100 using only evidence in the CV. Consider transferable experience, title relevance, required skills, seniority, industry, and location. Do not invent qualifications. The summary must state the strongest evidence and the most important gap in one concise sentence.`;
}

export async function rankJobsAgainstCv(
  profile: DesktopProfile,
  jobs: PersistedJob[],
  cvMarkdown: string,
  onBatch: (completed: number, total: number) => void = () => undefined,
  analyse: typeof runCodexJson = runCodexJson
): Promise<PersistedJob[]> {
  const eligible = jobs.filter((job) =>
    job.candidateProfile === profile.id &&
    !["applied", "expired", "rejected_by_rules"].includes(job.status)
  );
  if (eligible.length === 0) return jobs;

  try {
    const matches: AiJobMatch[] = [];
    const batchSize = 8;
    for (let offset = 0; offset < eligible.length; offset += batchSize) {
      const batch = eligible.slice(offset, offset + batchSize);
      const result = await analyse<{ matches: AiJobMatch[] }>({
        prompt: rankingPrompt(profile, cvMarkdown, batch),
        schema: rankingSchema,
        workingDirectory: pathForWorkingDirectory(profile),
        model: profile.aiModel,
        reasoningEffort: profile.reasoningEffort
      });
      matches.push(...result.matches);
      onBatch(Math.min(offset + batch.length, eligible.length), eligible.length);
    }
    return applyAiMatchScores(jobs, matches, 60);
  } catch {
    onBatch(eligible.length, eligible.length);
    return rankJobsLocally(profile, jobs, cvMarkdown);
  }
}

function pathForWorkingDirectory(profile: DesktopProfile): string {
  const normalized = profile.masterCvMarkdownPath.replace(/[\\/][^\\/]+$/, "");
  return normalized || process.cwd();
}
