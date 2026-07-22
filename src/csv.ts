import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { resolveFromRoot } from "./config.js";
import type { CandidateProfileId, PersistedJob } from "./types.js";
import { ensureDirectory } from "./utils.js";

const jobsCsvPath = resolveFromRoot("data", "jobs.csv");

export function getJobsCsvPath(): string {
  return jobsCsvPath;
}

export function candidateProfileForPersistedRow(
  value: string | undefined
): CandidateProfileId {
  return value?.trim() || "legacy-user";
}

export function readJobsCsv(): PersistedJob[] {
  if (!existsSync(jobsCsvPath)) {
    return [];
  }

  const raw = readFileSync(jobsCsvPath, "utf8");
  if (!raw.trim()) {
    return [];
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true
  }) as Record<string, string>[];

  return rows.map((row) => ({
    id: row.id ?? "",
    candidateProfile: candidateProfileForPersistedRow(row.candidateProfile),
    source: row.source as PersistedJob["source"],
    sourceQuery: row.sourceQuery || undefined,
    title: row.title ?? "",
    company: row.company ?? "",
    location: row.location ?? "",
    employmentType: row.employmentType ?? "",
    currentStatus: row.currentStatus ?? "",
    url: row.url ?? "",
    applyUrl: row.applyUrl ?? "",
    platform: row.platform ?? "",
    platformFamily: (row.platformFamily as PersistedJob["platformFamily"]) ?? "generic",
    description: row.description ?? "",
    excerpt: row.excerpt ?? "",
    datePosted: row.datePosted || undefined,
    lastSeenAt: row.lastSeenAt ?? "",
    cvRequired: row.cvRequired === "true",
    notes: row.notes ?? "",
    score: Number(row.score || 0),
    scoreReasons: row.scoreReasons ? row.scoreReasons.split(" | ") : [],
    fieldTags: row.fieldTags ? row.fieldTags.split(" | ").filter(Boolean) as PersistedJob["fieldTags"] : [],
    autoApply: row.autoApply === "true",
    selectedCvPdf: row.selectedCvPdf ?? "",
    coverLetterRequired: row.coverLetterRequired === "true",
    selectedCoverLetterPdf: row.selectedCoverLetterPdf ?? "",
    status: row.status as PersistedJob["status"],
    discoveredAt: row.discoveredAt ?? "",
    appliedAt: row.appliedAt ?? "",
    lastError: row.lastError ?? "",
    applyAttempts: Number(row.applyAttempts || 0),
    lastTriedAt: row.lastTriedAt ?? "",
    adapter: row.adapter ?? ""
  }));
}

export function writeJobsCsv(rows: PersistedJob[]): void {
  ensureDirectory(jobsCsvPath);

  const csv = stringify(
    rows.map((row) => ({
      id: row.id,
      candidateProfile: row.candidateProfile,
      source: row.source,
      sourceQuery: row.sourceQuery ?? "",
      title: row.title,
      company: row.company,
      location: row.location,
      employmentType: row.employmentType,
      currentStatus: row.currentStatus,
      url: row.url,
      applyUrl: row.applyUrl,
      platform: row.platform,
      platformFamily: row.platformFamily,
      description: row.description,
      excerpt: row.excerpt,
      datePosted: row.datePosted ?? "",
      lastSeenAt: row.lastSeenAt,
      cvRequired: String(row.cvRequired),
      notes: row.notes,
      score: row.score,
      scoreReasons: row.scoreReasons.join(" | "),
      fieldTags: row.fieldTags.join(" | "),
      autoApply: String(row.autoApply),
      selectedCvPdf: row.selectedCvPdf,
      coverLetterRequired: String(row.coverLetterRequired),
      selectedCoverLetterPdf: row.selectedCoverLetterPdf,
      status: row.status,
      discoveredAt: row.discoveredAt,
      appliedAt: row.appliedAt,
      lastError: row.lastError,
      applyAttempts: row.applyAttempts,
      lastTriedAt: row.lastTriedAt,
      adapter: row.adapter
    })),
    {
      header: true
    }
  );

  writeFileSync(jobsCsvPath, csv, "utf8");
}
