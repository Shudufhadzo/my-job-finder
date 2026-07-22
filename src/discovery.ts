import type { CandidateProfileId, PersistedJob, ScoredJob } from "./types.js";
import { readJobsCsv, writeJobsCsv } from "./csv.js";
import { inferJobFields } from "./job-fields.js";
import { assessListingQuality } from "./job-quality.js";
import { loadActiveCandidateId, loadCandidateProfile } from "./config.js";
import { searchWebForJobs } from "./search.js";
import { slugify } from "./utils.js";
import { toIsoNow } from "./utils.js";
import type { DiscoveredJob } from "./types.js";

export function buildProvisionalJob(job: DiscoveredJob): ScoredJob {
  return {
    ...job,
    score: 0,
    scoreReasons: ["Awaiting CV analysis"],
    fieldTags: inferJobFields(job),
    autoApply: false,
    selectedCvPdf: "",
    coverLetterRequired: false,
    selectedCoverLetterPdf: "",
    status: "new"
  };
}

export function jobIdentityKey(
  job: Pick<PersistedJob, "candidateProfile" | "company" | "title">
): string {
  return slugify(`${job.candidateProfile}-${job.company}-${job.title}`);
}

export function mergeJobs(existingJobs: PersistedJob[], discoveredJobs: ScoredJob[]): PersistedJob[] {
  const existingById = new Map(existingJobs.map((job) => [jobIdentityKey(job), job]));
  const now = toIsoNow();

  for (const job of discoveredJobs) {
    const key = jobIdentityKey(job);
    const existing = existingById.get(key);

    if (!existing) {
      existingById.set(key, {
        ...job,
        discoveredAt: now,
        appliedAt: "",
        lastError: "",
        applyAttempts: 0,
        lastTriedAt: "",
        adapter: "",
        coverLetterRequired: job.coverLetterRequired,
        selectedCoverLetterPdf: job.selectedCoverLetterPdf
      });
      continue;
    }

    const staleGroupedRejection =
      existing.status === "rejected_by_rules" &&
      /filtered grouped listing|grouped search\/listing pattern/i.test(existing.lastError);
    const preservedStatus = new Set(["applied", "needs_manual", "visa_needed", "error"]);
    const shouldPreserveStatus = preservedStatus.has(existing.status) ||
      (existing.status === "rejected_by_rules" && !staleGroupedRejection);

    existingById.set(key, {
      ...existing,
      ...job,
      discoveredAt: existing.discoveredAt || now,
      appliedAt: existing.appliedAt,
      lastError: staleGroupedRejection ? "" : existing.lastError,
      applyAttempts: existing.applyAttempts,
      lastTriedAt: existing.lastTriedAt,
      adapter: existing.adapter,
      coverLetterRequired: existing.coverLetterRequired || job.coverLetterRequired,
      selectedCoverLetterPdf: existing.selectedCoverLetterPdf || job.selectedCoverLetterPdf,
      status: shouldPreserveStatus ? existing.status : job.status
    });
  }

  return [...existingById.values()].sort((left, right) => right.score - left.score);
}

export async function runDiscovery(): Promise<PersistedJob[]> {
  const candidateProfile = loadActiveCandidateId();
  const profile = loadCandidateProfile(candidateProfile);
  const searchedJobs = await searchWebForJobs(candidateProfile);
  const provisionalJobs = searchedJobs.map((job) =>
    buildProvisionalJob({
      ...job,
      id: job.id.startsWith(`${candidateProfile}-`) ? job.id : `${candidateProfile}-${job.id}`,
      candidateProfile
    })
  );
  const deduped = [
    ...new Map(
      provisionalJobs.map((job) => {
        return [jobIdentityKey(job), job];
      })
    ).values()
  ];
  const merged = mergeJobs(readJobsCsv(), deduped).map((job) => {
    const quality = assessListingQuality(job);
    const qualityReason = quality.isGroupedListing
      ? `filtered grouped listing: ${quality.reasons.join("; ")}`
      : "";
    const scoreReasons = quality.isGroupedListing
      ? Array.from(new Set([...job.scoreReasons, qualityReason]))
      : job.scoreReasons;
    const normalizedJob = {
      ...job,
      scoreReasons
    };

    if (job.appliedAt) {
      return {
        ...normalizedJob,
        autoApply: false,
        status: "applied" as const
      };
    }

    if (quality.isGroupedListing) {
      return {
        ...normalizedJob,
        autoApply: false,
        status: "rejected_by_rules" as const,
        lastError: normalizedJob.lastError || qualityReason
      };
    }

    if (job.applyAttempts >= profile.applicationProfile.maxAutomaticApplyAttempts && job.status !== "applied") {
      return {
        ...normalizedJob,
        autoApply: false,
        status: "needs_manual" as const
      };
    }

    return normalizedJob;
  });
  writeJobsCsv(merged);
  return merged;
}
