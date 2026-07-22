import assert from "node:assert/strict";
import test from "node:test";

import * as cheerio from "cheerio";

import { extractApplyUrlFromHtml, isBadApplyUrl } from "./platforms.js";

test("detects LinkedIn password reset URLs as bad apply targets", () => {
  assert.equal(
    isBadApplyUrl("https://www.linkedin.com/uas/request-password-reset?trk=csm-v2_forgot_password"),
    true
  );
});

test("detects LinkedIn member profiles as bad apply targets", () => {
  assert.equal(
    isBadApplyUrl("https://www.linkedin.com/in/example-recruiter-123"),
    true
  );
});

test("extract apply URL ignores reset-password links and falls back to the job URL", () => {
  const baseUrl = "https://za.linkedin.com/jobs/view/data-scientist-at-example-123";
  const $ = cheerio.load(`
    <a href="https://www.linkedin.com/uas/request-password-reset?trk=csm-v2_forgot_password">Forgot password?</a>
  `);

  assert.equal(extractApplyUrlFromHtml($, baseUrl), baseUrl);
});

test("extract apply URL ignores LinkedIn grouped navigation links on an individual job", () => {
  const baseUrl = "https://za.linkedin.com/jobs/view/data-scientist-at-example-123";
  const $ = cheerio.load(`
    <a href="https://www.linkedin.com/jobs/scientist-jobs?trk=public_jobs_full-click">See more scientist jobs</a>
  `);

  assert.equal(extractApplyUrlFromHtml($, baseUrl), baseUrl);
});
