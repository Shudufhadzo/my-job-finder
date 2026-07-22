import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCandidateProfile,
  buildSearchConfig,
  computeNextRun,
  loadDesktopProfile,
  saveDesktopProfile
} from "./profile-store.js";
import { buildCodexInvocation } from "./local-codex.js";
import { resolveFromRoot } from "../config.js";
import { readCodexModelOptions } from "./codex-models.js";

test("desktop profile copies the submitted CV and persists normalized preferences", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "my-job-finder-profile-"));
  const sourceCv = path.join(root, "Candidate CV.pdf");
  writeFileSync(sourceCv, "test cv");

  const saved = saveDesktopProfile(
    {
      displayName: "  Jane Doe  ",
      sourceCvPath: sourceCv,
      targetRoles: ["Project Manager", " project manager ", "Teacher"],
      locations: ["Johannesburg", "Remote", "remote"],
      scheduleTime: "10:00",
      scheduleEnabled: true,
      aiModel: "gpt-5.6-terra",
      reasoningEffort: "high"
    },
    root
  );

  assert.equal(saved.displayName, "Jane Doe");
  assert.deepEqual(saved.targetRoles, ["Project Manager", "Teacher"]);
  assert.deepEqual(saved.locations, ["Johannesburg", "Remote"]);
  assert.equal(saved.aiModel, "gpt-5.6-terra");
  assert.equal(saved.reasoningEffort, "high");
  assert.notEqual(saved.masterCvPath, sourceCv);
  assert.ok(existsSync(saved.masterCvPath));
  assert.equal(readFileSync(saved.masterCvPath, "utf8"), "test cv");
  assert.deepEqual(loadDesktopProfile(root), saved);
});

test("common role spelling mistakes are normalized before job search", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "my-job-finder-role-"));
  const sourceCv = path.join(root, "candidate.txt");
  writeFileSync(sourceCv, "Candidate CV", "utf8");

  const saved = saveDesktopProfile({
    displayName: "Jane Doe",
    sourceCvPath: sourceCv,
    targetRoles: ["Data Scientiest"],
    locations: ["Johannesburg"],
    scheduleTime: "10:00",
    scheduleEnabled: true
  }, root);

  assert.deepEqual(saved.targetRoles, ["Data Scientist"]);
});

test("a different person receives isolated profile ownership on the same installation", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "my-job-finder-people-"));
  const firstCv = path.join(root, "first.txt");
  const secondCv = path.join(root, "second.txt");
  writeFileSync(firstCv, "First candidate CV", "utf8");
  writeFileSync(secondCv, "Second candidate CV", "utf8");

  const first = saveDesktopProfile({
    displayName: "Jane Doe",
    sourceCvPath: firstCv,
    targetRoles: ["Data Analyst"],
    locations: ["Remote"],
    scheduleTime: "10:00",
    scheduleEnabled: true
  }, root);
  const second = saveDesktopProfile({
    displayName: "John Smith",
    sourceCvPath: secondCv,
    targetRoles: ["Project Manager"],
    locations: ["Johannesburg"],
    scheduleTime: "10:00",
    scheduleEnabled: true
  }, root);

  assert.notEqual(first.id, second.id);
  assert.equal(loadDesktopProfile(root)?.id, second.id);
});

test("candidate and search configuration are derived from user preferences", () => {
  const profile = {
    version: 1 as const,
    id: "desktop-user" as const,
    displayName: "Jane Doe",
    masterCvPath: "/Users/jane/My Job Finder/master-cv.pdf",
    masterCvMarkdownPath: "/Users/jane/My Job Finder/master-cv.md",
    targetRoles: ["Data Scientist", "Analytics Engineer"],
    locations: ["Cape Town", "Remote"],
    scheduleTime: "10:00",
    scheduleEnabled: true,
    aiModel: "gpt-5.6-sol",
    reasoningEffort: "xhigh" as const,
    createdAt: "2026-07-21T08:00:00.000Z",
    updatedAt: "2026-07-21T08:00:00.000Z"
  };

  const candidate = buildCandidateProfile(profile, "/Users/jane/My Job Finder");
  const search = buildSearchConfig(profile);

  assert.equal(candidate.name, "Jane Doe");
  assert.equal(candidate.applicationProfile.masterResumePdf, profile.masterCvPath);
  assert.deepEqual(candidate.targetTitles, profile.targetRoles);
  assert.deepEqual(candidate.searchLocations, profile.locations);
  assert.ok(search.queries.includes('"Data Scientist" "Cape Town" jobs'));
  assert.ok(search.queries.includes('"Analytics Engineer" Remote jobs'));
});

test("Codex model options are read from the local model cache with the configured model first", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "my-job-finder-models-"));
  const cachePath = path.join(root, "models_cache.json");
  const configPath = path.join(root, "config.toml");
  writeFileSync(cachePath, JSON.stringify({ models: [
    { slug: "gpt-5.6-terra" },
    { slug: "gpt-5.6-sol" },
    { slug: "gpt-5.5" },
    { slug: "gpt-5.6-sol" }
  ] }));
  writeFileSync(configPath, 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "xhigh"\n');

  const options = readCodexModelOptions({ cachePath, configPath });
  assert.deepEqual(options.models, ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5"]);
  assert.equal(options.defaultModel, "gpt-5.6-sol");
  assert.equal(options.defaultReasoningEffort, "xhigh");
});

test("a stale configured model falls back to the local runtime catalogue", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "my-job-finder-stale-model-"));
  const cachePath = path.join(root, "models_cache.json");
  const configPath = path.join(root, "config.toml");
  writeFileSync(cachePath, JSON.stringify({ models: [
    { slug: "gpt-5.5" },
    { slug: "gpt-5.4" }
  ] }));
  writeFileSync(configPath, 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "low"\n');

  const options = readCodexModelOptions({ cachePath, configPath });

  assert.deepEqual(options.models, ["gpt-5.5", "gpt-5.4"]);
  assert.equal(options.defaultModel, "gpt-5.5");
});

test("next daily run uses the next local occurrence of the configured time", () => {
  const before = new Date("2026-07-21T07:30:00.000Z");
  const after = new Date("2026-07-21T08:30:00.000Z");

  assert.equal(
    computeNextRun("10:00", before, 120).toISOString(),
    "2026-07-21T08:00:00.000Z"
  );
  assert.equal(
    computeNextRun("10:00", after, 120).toISOString(),
    "2026-07-22T08:00:00.000Z"
  );
});

test("Codex invocation reuses the local authenticated CLI on each platform", () => {
  const windows = buildCodexInvocation({
    platform: "win32",
    executable: "C:\\Users\\Jane\\AppData\\Roaming\\npm\\codex.cmd",
    schemaPath: "C:\\Temp\\schema.json",
    outputPath: "C:\\Temp\\output.json",
    model: "gpt-5.3-codex",
    reasoningEffort: "medium"
  });
  const mac = buildCodexInvocation({
    platform: "darwin",
    executable: "/opt/homebrew/bin/codex",
    schemaPath: "/tmp/schema.json",
    outputPath: "/tmp/output.json",
    model: "gpt-5.3-codex",
    reasoningEffort: "medium"
  });
  const windowsNative = buildCodexInvocation({
    platform: "win32",
    executable: "C:\\Program Files\\Codex\\codex.exe",
    schemaPath: "C:\\Temp\\schema.json",
    outputPath: "C:\\Temp\\output.json",
    model: "gpt-5.3-codex",
    reasoningEffort: "medium"
  });
  const windowsScript = buildCodexInvocation({
    platform: "win32",
    executable: "C:\\Users\\Jane\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js",
    schemaPath: "C:\\Temp\\schema.json",
    outputPath: "C:\\Temp\\output.json",
    model: "gpt-5.3-codex",
    reasoningEffort: "medium"
  });

  assert.equal(windows.file, "cmd.exe");
  assert.deepEqual(windows.args.slice(0, 2), ["/d", "/s"]);
  assert.ok(windows.args.some((arg) => arg.includes("codex.cmd")));
  assert.match(windows.args[3] || "", /^"".*codex\.cmd"/);
  assert.match(windows.args[3] || "", /"-""$/);
  assert.equal(windowsNative.file, "C:\\Program Files\\Codex\\codex.exe");
  assert.ok(windowsNative.args.includes("--output-schema"));
  assert.equal(windowsScript.file, process.execPath);
  assert.match(windowsScript.args[0] || "", /codex\.js$/);
  assert.equal(mac.file, "/opt/homebrew/bin/codex");
  assert.ok(mac.args.includes("--output-schema"));
  assert.ok(mac.args.includes("--output-last-message"));
  assert.ok(mac.args.includes("read-only"));
});

test("engine path resolution preserves absolute desktop document directories", () => {
  const absolute = path.resolve(os.tmpdir(), "My Job Finder", "documents");
  assert.equal(resolveFromRoot(absolute), absolute);
});
