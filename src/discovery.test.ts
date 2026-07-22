import assert from "node:assert/strict";
import test from "node:test";

import type { DiscoveredJob, PersistedJob, ScoredJob } from "./types.js";
import { buildProvisionalJob, mergeJobs } from "./discovery.js";

test("fresh discoveries start without candidate-specific documents or scores", () => {
  const discovered = {
    id: "job-one",
    candidateProfile: "candidate-123",
    source: "search",
    title: "Data Analyst",
    company: "Example",
    location: "Remote",
    employmentType: "Full time",
    currentStatus: "Open",
    url: "https://example.com/jobs/one",
    applyUrl: "https://example.com/jobs/one",
    platform: "example.com",
    platformFamily: "generic",
    description: "Build reports and dashboards.",
    excerpt: "Build reports and dashboards.",
    lastSeenAt: "2026-07-22T08:00:00.000Z",
    cvRequired: true,
    notes: ""
  } as DiscoveredJob;

  const provisional = buildProvisionalJob(discovered);

  assert.equal(provisional.score, 0);
  assert.equal(provisional.status, "new");
  assert.equal(provisional.selectedCvPdf, "");
  assert.equal(provisional.selectedCoverLetterPdf, "");
  assert.deepEqual(provisional.fieldTags, ["data_analytics"]);
});

test("a corrected individual listing is released from a stale grouped-listing rejection", () => {
  const existing = {
    id: "job-one",
    candidateProfile: "desktop-user",
    company: "Example",
    title: "Data Scientist",
    status: "rejected_by_rules",
    score: 0,
    lastError: "filtered grouped listing: URL matches a grouped search/listing pattern",
    discoveredAt: "2026-07-21T08:00:00.000Z",
    appliedAt: "",
    applyAttempts: 0,
    lastTriedAt: "",
    adapter: "",
    coverLetterRequired: false,
    selectedCoverLetterPdf: ""
  } as PersistedJob;
  const rescored = {
    ...existing,
    score: 82,
    status: "ready_to_apply",
    lastError: "",
    selectedCvPdf: "master.pdf",
    scoreReasons: ["title match"],
    fieldTags: ["data_science"],
    autoApply: true
  } as ScoredJob;

  const [merged] = mergeJobs([existing], [rescored]);
  assert.equal(merged?.status, "ready_to_apply");
  assert.equal(merged?.lastError, "");
  assert.equal(merged?.score, 82);
});
