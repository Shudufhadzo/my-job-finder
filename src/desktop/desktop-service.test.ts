import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildDesktopState, configureDesktopProfile, repairStaleDesktopListings } from "./desktop-service.js";
import type { PersistedJob } from "../types.js";

test("desktop configuration extracts a Markdown CV and writes candidate-specific search files", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "my-job-finder-service-"));
  const workspace = path.join(root, "workspace");
  const cv = path.join(root, "cv.txt");
  writeFileSync(cv, "Jane Doe\nData Analyst\nSQL Python dashboard reporting", "utf8");

  const profile = await configureDesktopProfile(
    {
      displayName: "Jane Doe",
      sourceCvPath: cv,
      targetRoles: ["Data Analyst"],
      locations: ["Pretoria", "Remote"],
      scheduleTime: "10:00",
      scheduleEnabled: true,
      aiModel: "gpt-5.6-sol",
      reasoningEffort: "xhigh"
    },
    { dataRoot: root, workspaceRoot: workspace }
  );

  const active = JSON.parse(readFileSync(path.join(workspace, "config", "active-candidate.json"), "utf8"));
  const candidate = JSON.parse(readFileSync(path.join(workspace, "config", "candidate-profiles", `${profile.id}.json`), "utf8"));
  const search = JSON.parse(readFileSync(path.join(workspace, "config", `search-queries-${profile.id}.json`), "utf8"));
  assert.equal(active.activeCandidate, profile.id);
  assert.equal(candidate.name, "Jane Doe");
  assert.equal(candidate.applicationProfile.masterResumePdf, profile.masterCvPath);
  assert.ok(search.queries.some((query: string) => query.includes("Pretoria")));
  assert.match(readFileSync(profile.masterCvMarkdownPath, "utf8"), /SQL Python dashboard reporting/);
});

test("stale grouped rejections are repaired to their individual job page locally", () => {
  const job = {
    id: "linkedin-job",
    candidateProfile: "desktop-user",
    title: "Data Scientist",
    company: "Acme",
    url: "https://za.linkedin.com/jobs/view/data-scientist-at-acme-123",
    applyUrl: "https://www.linkedin.com/jobs/scientist-jobs?trk=public_jobs_full-click",
    status: "rejected_by_rules",
    lastError: "filtered grouped listing: URL matches a grouped search/listing pattern",
    scoreReasons: ["location fit", "filtered grouped listing: URL matches a grouped search/listing pattern"]
  } as PersistedJob;

  const [repaired] = repairStaleDesktopListings([job]);

  assert.equal(repaired?.status, "new");
  assert.equal(repaired?.applyUrl, job.url);
  assert.equal(repaired?.lastError, "");
  assert.deepEqual(repaired?.scoreReasons, ["location fit"]);
});

test("desktop state contains only the active desktop user's jobs and absolute document links", () => {
  const documentsRoot = path.resolve(os.tmpdir(), "my-job-finder-jane");
  const profile = {
    version: 1 as const,
    id: "desktop-user" as const,
    displayName: "Jane Doe",
    masterCvPath: path.join(documentsRoot, "master-cv.pdf"),
    masterCvMarkdownPath: path.join(documentsRoot, "master-cv.md"),
    targetRoles: ["Data Analyst"],
    locations: ["Remote"],
    scheduleTime: "10:00",
    scheduleEnabled: true,
    aiModel: "gpt-5.6-sol",
    reasoningEffort: "xhigh" as const,
    createdAt: "2026-07-21T08:00:00.000Z",
    updatedAt: "2026-07-21T08:00:00.000Z"
  };
  const baseJob = {
    id: "desktop-job",
    candidateProfile: "desktop-user",
    title: "Data Analyst",
    company: "Acme",
    location: "Remote",
    score: 80,
    status: "ready_to_apply",
    selectedCvPdf: path.join(documentsRoot, "acme-cv.pdf"),
    selectedCoverLetterPdf: path.join(documentsRoot, "acme-letter.pdf")
  } as PersistedJob;

  const state = buildDesktopState(profile, [baseJob, { ...baseJob, id: "old", candidateProfile: "other-user" }], new Date("2026-07-21T07:00:00.000Z"), 120);
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0]?.id, "desktop-job");
  assert.match(state.nextRunAt, /^2026-07-21T08:00:00\.000Z$/);
  assert.ok(path.isAbsolute(state.jobs[0]?.selectedCvPdf || ""));
});
