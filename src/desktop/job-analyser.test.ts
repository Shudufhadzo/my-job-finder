import assert from "node:assert/strict";
import test from "node:test";

import type { PersistedJob } from "../types.js";
import { applyAiMatchScores, rankJobsLocally } from "./job-analyser.js";
import type { DesktopProfile } from "./types.js";

const job = (id: string, score = 0): PersistedJob => ({
  id,
  candidateProfile: "desktop-user",
  source: "search",
  title: "Data Scientist",
  company: "Example",
  location: "Johannesburg",
  employmentType: "Full time",
  currentStatus: "Open",
  url: `https://example.com/jobs/${id}`,
  applyUrl: `https://example.com/jobs/${id}`,
  platform: "example.com",
  platformFamily: "generic",
  description: "Build machine learning models with Python and SQL.",
  excerpt: "Build machine learning models.",
  lastSeenAt: "2026-07-22T08:00:00.000Z",
  cvRequired: true,
  notes: "",
  score,
  scoreReasons: [],
  fieldTags: ["data_science"],
  autoApply: false,
  selectedCvPdf: "master.pdf",
  coverLetterRequired: false,
  selectedCoverLetterPdf: "",
  status: "new",
  discoveredAt: "2026-07-22T08:00:00.000Z",
  appliedAt: "",
  lastError: "",
  applyAttempts: 0,
  lastTriedAt: "",
  adapter: ""
});

test("AI match scores replace provisional zero scores and qualify matching jobs", () => {
  const [ranked] = applyAiMatchScores([job("one")], [
    { jobId: "one", score: 84, summary: "Strong Python, SQL, and ML alignment." }
  ], 60);

  assert.equal(ranked?.score, 84);
  assert.equal(ranked?.status, "ready_to_apply");
  assert.match(ranked?.scoreReasons.join(" ") || "", /AI CV match: 84%/);
});

test("AI ranking never revives expired or grouped-rejected jobs", () => {
  const expired = { ...job("expired"), status: "expired" as const };
  const rejected = { ...job("rejected"), status: "rejected_by_rules" as const };
  const ranked = applyAiMatchScores([expired, rejected], [
    { jobId: "expired", score: 95, summary: "Match" },
    { jobId: "rejected", score: 95, summary: "Match" }
  ], 60);

  assert.equal(ranked[0]?.status, "expired");
  assert.equal(ranked[1]?.status, "rejected_by_rules");
});

test("local CV ranking produces evidence-based nonzero scores without candidate-specific rules", () => {
  const profile = {
    id: "desktop-user",
    targetRoles: ["Data Scientist"],
    locations: ["Johannesburg"]
  } as DesktopProfile;
  const matching = job("matching");
  const unrelated = {
    ...job("unrelated"),
    title: "Fashion Model",
    description: "Pose for clothing photography and social media campaigns."
  };
  const unsupportedDataRole = {
    ...job("capturer"),
    title: "Data Capturer",
    description: "Capture records using Python, SQL, analytics dashboards, and machine learning terminology."
  };
  const relatedDataRole = {
    ...job("analyst"),
    title: "Data Analyst",
    description: "Analyse data with SQL and build reporting dashboards."
  };

  const ranked = rankJobsLocally(
    profile,
    [matching, unrelated, unsupportedDataRole, relatedDataRole],
    "Data Scientist with Python, SQL, machine learning, analytics, and dashboard experience."
  );

  assert.ok((ranked[0]?.score || 0) >= 50);
  assert.ok((ranked[0]?.score || 0) > (ranked[1]?.score || 0));
  assert.ok((ranked[2]?.score || 0) < 50);
  assert.ok((ranked[3]?.score || 0) >= 50);
  assert.match(ranked[0]?.scoreReasons.join(" ") || "", /Local CV match/);
});
