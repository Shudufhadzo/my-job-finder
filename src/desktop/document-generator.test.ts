import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildDocumentPrompt,
  buildLocalApplication,
  documentPathsForJob,
  renderCoverLetterHtml,
  renderResumeHtml,
  shouldUseLocalPreparation
} from "./document-generator.js";
import type { TailoredApplication } from "./document-generator.js";
import type { PersistedJob } from "../types.js";
import type { DesktopProfile } from "./types.js";

const application: TailoredApplication = {
  matchScore: 82,
  matchSummary: "Strong alignment across delivery, reporting, and stakeholder coordination.",
  resume: {
    headline: "Project Coordinator | Education Programmes",
    summary: "Coordinator with teaching experience and structured delivery skills.",
    contact: ["jane@example.com", "+1 202 555 0100", "Johannesburg, South Africa"],
    skills: ["Project coordination", "Reporting", "Stakeholder communication"],
    experience: [
      {
        role: "Teacher",
        organisation: "Example School",
        dates: "2024 to present",
        bullets: ["Coordinated assessments, learner records, and reporting."]
      }
    ],
    education: ["Bachelor of Education, Example University"],
    additionalSections: [
      { heading: "Certifications", items: ["Project Fundamentals Certificate"] }
    ]
  },
  coverLetter: {
    salutation: "Dear Hiring Team",
    paragraphs: ["I am applying for the Project Coordinator role."],
    closing: "Kind regards"
  }
};

test("tailored document templates contain job context without inventing contact details", () => {
  const resume = renderResumeHtml(application, {
    candidateName: "Jane Doe",
    company: "Acme Foundation",
    title: "Project Coordinator"
  });
  const letter = renderCoverLetterHtml(application, {
    candidateName: "Jane Doe",
    company: "Acme Foundation",
    title: "Project Coordinator"
  });

  assert.match(resume, /Jane Doe/);
  assert.match(resume, /Project Coordinator \| Education Programmes/);
  assert.match(resume, /jane@example\.com/);
  assert.match(resume, /Example School/);
  assert.match(resume, /Project Fundamentals Certificate/);
  assert.doesNotMatch(resume, /legacy candidate|legacy employer/i);
  assert.match(letter, /Acme Foundation/);
  assert.match(letter, /I am applying for the Project Coordinator role/);
  assert.match(letter, /Kind regards/);
});

test("each qualified job receives its own local PDF folder", () => {
  const profile = {
    id: "desktop-user",
    displayName: "Jane Doe",
    masterCvPath: "C:\\CV\\master.pdf",
    masterCvMarkdownPath: "C:\\CV\\master.md"
  } as DesktopProfile;
  const first = { id: "first-job", company: "Acme", title: "Data Analyst" } as PersistedJob;
  const second = { id: "second-job", company: "Acme", title: "Data Analyst" } as PersistedJob;

  const firstPaths = documentPathsForJob(profile, first, "C:\\AppData");
  const secondPaths = documentPathsForJob(profile, second, "C:\\AppData");

  assert.notEqual(path.dirname(firstPaths.cvPdf), path.dirname(secondPaths.cvPdf));
  assert.equal(path.basename(firstPaths.cvPdf), "cv.pdf");
  assert.equal(path.basename(firstPaths.coverLetterPdf), "cover-letter.pdf");
});

test("document folders change when a fresh candidate uploads a different CV", () => {
  const profile = {
    id: "desktop-user",
    displayName: "Jane Doe",
    masterCvPath: "C:\\CV\\master.pdf",
    masterCvMarkdownPath: "C:\\CV\\master.md"
  } as DesktopProfile;
  const job = { id: "same-job", company: "Acme", title: "Data Analyst" } as PersistedJob;

  const first = documentPathsForJob(profile, job, "C:\\AppData", "cv-fingerprint-one");
  const second = documentPathsForJob(profile, job, "C:\\AppData", "cv-fingerprint-two");

  assert.notEqual(first.directory, second.directory);
});

test("document AI receives extracted Markdown content rather than a binary PDF path", () => {
  const profile = {
    id: "desktop-user",
    displayName: "Jane Doe",
    masterCvPath: "C:\\CV\\master.pdf",
    masterCvMarkdownPath: "C:\\CV\\master.md",
    targetRoles: ["Data Analyst"]
  } as DesktopProfile;
  const job = {
    company: "Acme",
    title: "Data Analyst",
    location: "Remote",
    description: "SQL and dashboard reporting"
  } as PersistedJob;

  const prompt = buildDocumentPrompt(profile, job, "# Jane Doe CV\n\nPython and SQL experience");
  assert.match(prompt, /MASTER CV MARKDOWN/);
  assert.match(prompt, /Python and SQL experience/);
  assert.doesNotMatch(prompt, /C:\\CV\\master\.pdf/);
});

test("local document preparation preserves a fresh candidate's own CV evidence", () => {
  const profile = {
    id: "desktop-jane",
    displayName: "Jane Doe",
    targetRoles: ["Project Coordinator"]
  } as DesktopProfile;
  const job = {
    company: "Acme Foundation",
    title: "Project Coordinator",
    location: "Johannesburg",
    description: "Coordinate projects, stakeholder reporting, schedules, and education programmes."
  } as PersistedJob;
  const cv = `# Jane Doe CV
CONTACT
jane@example.com
Johannesburg, South Africa
CORE SKILLS
Project coordination
Stakeholder reporting
Git and GitHub
EDUCATION
Bachelor of Education, Example University
EXPERIENCE
Teacher, Example School, 2022 to present
Coordinated learner records, schedules, and parent reporting.`;

  const local = buildLocalApplication(profile, job, cv);

  assert.ok(local.matchScore > 0);
  assert.ok(local.resume.contact.includes("jane@example.com"));
  assert.ok(!local.resume.contact.includes("Git and GitHub"));
  assert.ok(local.resume.skills.includes("Project coordination"));
  assert.match(JSON.stringify(local.resume.additionalSections), /Example School/);
  assert.doesNotMatch(JSON.stringify(local), /Legacy Candidate|Legacy Employer/);
});

test("locally ranked jobs do not retry an unavailable external model for every document", () => {
  assert.equal(shouldUseLocalPreparation({ scoreReasons: ["Local CV match: 72% - evidence"] }), true);
  assert.equal(shouldUseLocalPreparation({ scoreReasons: ["AI CV match: 72% - evidence"] }), false);
  assert.equal(shouldUseLocalPreparation({ scoreReasons: [] }, true), true);
});
