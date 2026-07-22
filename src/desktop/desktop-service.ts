import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readJobsCsv, writeJobsCsv } from "../csv.js";
import { getRootDir } from "../config.js";
import { runDiscovery } from "../discovery.js";
import { isBadApplyUrl } from "../platforms.js";
import type { PersistedJob } from "../types.js";
import { ensureDirectory } from "../utils.js";
import { prepareApplicationDocuments, type DocumentGenerationEvent } from "./document-generator.js";
import {
  computeNextRun,
  getDesktopDataRoot,
  loadDesktopProfile,
  saveDesktopProfile,
  writeEngineConfiguration
} from "./profile-store.js";
import type { DesktopProfile, DesktopProfileInput, DesktopState } from "./types.js";
import { readCodexModelOptions } from "./codex-models.js";
import { extractCvToMarkdown } from "./cv-extractor.js";
import { rankJobsAgainstCv, rankJobsLocally } from "./job-analyser.js";

interface DesktopServicePaths {
  dataRoot?: string;
  workspaceRoot?: string;
}

export type DesktopRunEvent =
  | { type: "run_started" | "cv_started" | "cv_completed" | "discovery_started" | "discovery_completed" | "ranking_started" | "ranking_completed" | "run_completed"; message: string; timestamp: string }
  | (DocumentGenerationEvent & { timestamp: string })
  | { type: "run_failed"; message: string; timestamp: string };

function event<T extends Omit<DesktopRunEvent, "timestamp">>(value: T): T & { timestamp: string } {
  return { ...value, timestamp: new Date().toISOString() };
}

export async function configureDesktopProfile(
  input: DesktopProfileInput,
  paths: DesktopServicePaths = {}
): Promise<DesktopProfile> {
  const dataRoot = paths.dataRoot || getDesktopDataRoot();
  const workspaceRoot = paths.workspaceRoot || getRootDir();
  const profile = saveDesktopProfile(input, dataRoot);
  await extractCvToMarkdown(profile.masterCvPath, profile.masterCvMarkdownPath, profile.displayName);
  writeEngineConfiguration(profile, workspaceRoot, dataRoot);
  return profile;
}

export function buildDesktopState(
  profile: DesktopProfile | null,
  jobs: PersistedJob[],
  now = new Date(),
  timezoneOffsetMinutes = -now.getTimezoneOffset()
): DesktopState {
  const codexOptions = readCodexModelOptions();
  return {
    profile,
    jobs: profile ? jobs.filter((job) => job.candidateProfile === profile.id) : [],
    nextRunAt: profile?.scheduleEnabled
      ? computeNextRun(profile.scheduleTime, now, timezoneOffsetMinutes).toISOString()
      : "",
    generatedAt: now.toISOString(),
    availableModels: codexOptions.models,
    availableReasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"]
  };
}

export function getDesktopState(dataRoot = getDesktopDataRoot()): DesktopState {
  return buildDesktopState(loadDesktopProfile(dataRoot), readJobsCsv());
}

export function repairStaleDesktopListings(jobs: PersistedJob[]): PersistedJob[] {
  return jobs.map((job) => {
    const individualJobUrl = /linkedin\.com\/jobs\/view\//i.test(job.url);
    const repairedApplyUrl = individualJobUrl && isBadApplyUrl(job.applyUrl)
      ? job.url
      : job.applyUrl;
    const staleGroupedRejection =
      individualJobUrl &&
      job.status === "rejected_by_rules" &&
      /filtered grouped listing|grouped search\/listing pattern/i.test(job.lastError);

    if (!staleGroupedRejection) {
      return repairedApplyUrl === job.applyUrl ? job : { ...job, applyUrl: repairedApplyUrl };
    }

    return {
      ...job,
      applyUrl: repairedApplyUrl,
      status: "new",
      autoApply: false,
      lastError: "",
      scoreReasons: job.scoreReasons.filter((reason) =>
        !/filtered grouped listing|grouped listing page|grouped search\/listing pattern/i.test(reason)
      )
    };
  });
}

function writeRunState(dataRoot: string, payload: object): void {
  const statePath = path.join(dataRoot, "run-state.json");
  ensureDirectory(statePath);
  writeFileSync(statePath, JSON.stringify(payload, null, 2), "utf8");
}

export function readRunState(dataRoot = getDesktopDataRoot()): Record<string, unknown> {
  const statePath = path.join(dataRoot, "run-state.json");
  return existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8")) as Record<string, unknown>
    : {};
}

export async function runDesktopRefresh(
  paths: DesktopServicePaths = {},
  onEvent: (runEvent: DesktopRunEvent) => void = () => undefined
): Promise<DesktopState> {
  const dataRoot = paths.dataRoot || getDesktopDataRoot();
  const workspaceRoot = paths.workspaceRoot || getRootDir();
  const profile = loadDesktopProfile(dataRoot);
  if (!profile) {
    throw new Error("Complete setup and select a CV before running the daily search.");
  }

  const startedAt = new Date().toISOString();
  onEvent(event({ type: "run_started", message: "Daily job search started" }));
  writeRunState(dataRoot, { status: "running", startedAt });

  try {
    onEvent(event({ type: "cv_started", message: "Reading the uploaded CV into a private Markdown profile" }));
    const cvMarkdown = await extractCvToMarkdown(
      profile.masterCvPath,
      profile.masterCvMarkdownPath,
      profile.displayName
    );
    writeEngineConfiguration(profile, workspaceRoot, dataRoot);
    onEvent(event({ type: "cv_completed", message: "Master CV profile is ready for matching" }));
    onEvent(event({ type: "discovery_started", message: "Searching configured roles and locations" }));
    const discovered = await runDiscovery();
    const candidateCount = discovered.filter((job) => job.candidateProfile === profile.id).length;
    onEvent(event({ type: "discovery_completed", message: `Discovery completed with ${candidateCount} tracked jobs` }));

    onEvent(event({ type: "ranking_started", message: `AI is matching ${candidateCount} jobs against the CV` }));
    const ranked = await rankJobsAgainstCv(profile, discovered, cvMarkdown, (completed, total) => {
      onEvent(event({ type: "ranking_started", message: `AI ranked ${completed} of ${total} jobs` }));
    });
    onEvent(event({ type: "ranking_completed", message: "AI job matching completed" }));

    const prepared = await prepareApplicationDocuments(profile, ranked, dataRoot, (documentEvent) => {
      onEvent(event(documentEvent));
    });
    writeJobsCsv(prepared);
    const completedAt = new Date().toISOString();
    const state = buildDesktopState(profile, prepared);
    writeRunState(dataRoot, { status: "completed", startedAt, completedAt, jobs: state.jobs.length });
    onEvent(event({ type: "run_completed", message: `Daily run completed with ${state.jobs.length} jobs` }));
    return state;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeRunState(dataRoot, { status: "failed", startedAt, failedAt: new Date().toISOString(), error: message });
    onEvent(event({ type: "run_failed", message }));
    throw error;
  }
}

export async function runDesktopReprocess(
  paths: DesktopServicePaths = {},
  onEvent: (runEvent: DesktopRunEvent) => void = () => undefined,
  options: { localOnly?: boolean } = {}
): Promise<DesktopState> {
  const dataRoot = paths.dataRoot || getDesktopDataRoot();
  const workspaceRoot = paths.workspaceRoot || getRootDir();
  const profile = loadDesktopProfile(dataRoot);
  if (!profile) {
    throw new Error("Complete setup and select a CV before rebuilding matches and documents.");
  }

  const startedAt = new Date().toISOString();
  const mode = options.localOnly ? "reprocess-local" : "reprocess";
  onEvent(event({ type: "run_started", message: `${options.localOnly ? "On-device" : "Local job"} reprocessing started` }));
  writeRunState(dataRoot, { status: "running", mode, startedAt });

  try {
    onEvent(event({ type: "cv_started", message: "Reading the uploaded CV into a private Markdown profile" }));
    const cvMarkdown = await extractCvToMarkdown(
      profile.masterCvPath,
      profile.masterCvMarkdownPath,
      profile.displayName
    );
    writeEngineConfiguration(profile, workspaceRoot, dataRoot);
    onEvent(event({ type: "cv_completed", message: "Master CV profile is ready for matching" }));

    const localJobs = repairStaleDesktopListings(readJobsCsv());
    const candidateCount = localJobs.filter((job) => job.candidateProfile === profile.id).length;
    onEvent(event({
      type: "ranking_started",
      message: `${options.localOnly ? "On-device analysis is" : "AI is"} matching ${candidateCount} saved jobs against the CV`
    }));
    const ranked = options.localOnly
      ? rankJobsLocally(profile, localJobs, cvMarkdown)
      : await rankJobsAgainstCv(profile, localJobs, cvMarkdown, (completed, total) => {
          onEvent(event({ type: "ranking_started", message: `AI ranked ${completed} of ${total} saved jobs` }));
        });
    onEvent(event({
      type: "ranking_completed",
      message: `${options.localOnly ? "On-device" : "AI"} job matching completed`
    }));

    const prepared = await prepareApplicationDocuments(profile, ranked, dataRoot, (documentEvent) => {
      onEvent(event(documentEvent));
    }, { localOnly: Boolean(options.localOnly) });
    writeJobsCsv(prepared);
    const completedAt = new Date().toISOString();
    const state = buildDesktopState(profile, prepared);
    writeRunState(dataRoot, {
      status: "completed",
      mode,
      startedAt,
      completedAt,
      jobs: state.jobs.length
    });
    onEvent(event({ type: "run_completed", message: `${options.localOnly ? "On-device" : "Local"} reprocessing completed with ${state.jobs.length} jobs` }));
    return state;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeRunState(dataRoot, {
      status: "failed",
      mode,
      startedAt,
      failedAt: new Date().toISOString(),
      error: message
    });
    onEvent(event({ type: "run_failed", message }));
    throw error;
  }
}
