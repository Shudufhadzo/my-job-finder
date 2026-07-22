import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { extractCvToMarkdown, formatExtractedPagesAsMarkdown } from "./cv-extractor.js";

test("extracted CV pages become a readable Markdown master profile", () => {
  const markdown = formatExtractedPagesAsMarkdown("Jane Doe CV", [
    "JANE DOE\nDATA SCIENTIST\nPython SQL Machine Learning",
    "EXPERIENCE\nData Scientist | Example Ltd | 2022 to present"
  ]);

  assert.match(markdown, /^# Jane Doe CV/m);
  assert.match(markdown, /## Page 1/);
  assert.match(markdown, /DATA SCIENTIST/);
  assert.match(markdown, /## Page 2/);
});

test("plain-text CV uploads are persisted as Markdown without candidate-specific assumptions", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "my-job-finder-cv-"));
  const source = path.join(root, "candidate.txt");
  const output = path.join(root, "documents", "master-cv.md");
  writeFileSync(source, "Jane Doe\nProgramme Manager\nStakeholder reporting and delivery", "utf8");

  await extractCvToMarkdown(source, output, "Jane Doe");

  assert.equal(existsSync(output), true);
  assert.match(readFileSync(output, "utf8"), /Programme Manager/);
});
