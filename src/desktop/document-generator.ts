import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";

import type { PersistedJob } from "../types.js";
import { ensureDirectory, slugify } from "../utils.js";
import { runCodexJson } from "./local-codex.js";
import type { DesktopProfile } from "./types.js";

export interface TailoredApplication {
  matchScore: number;
  matchSummary: string;
  resume: {
    headline: string;
    summary: string;
    contact: string[];
    skills: string[];
    experience: Array<{
      role: string;
      organisation: string;
      dates: string;
      bullets: string[];
    }>;
    education: string[];
    additionalSections: Array<{
      heading: string;
      items: string[];
    }>;
  };
  coverLetter: {
    salutation: string;
    paragraphs: string[];
    closing: string;
  };
}

interface DocumentContext {
  candidateName: string;
  company: string;
  title: string;
}

const documentTemplateVersion = "2";

export interface DocumentGenerationEvent {
  type: "document_started" | "document_completed" | "document_failed";
  jobId: string;
  message: string;
}

const outputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    matchScore: { type: "integer", minimum: 0, maximum: 100 },
    matchSummary: { type: "string" },
    resume: {
      type: "object",
      additionalProperties: false,
      properties: {
        headline: { type: "string" },
        summary: { type: "string" },
        contact: { type: "array", items: { type: "string" } },
        skills: { type: "array", items: { type: "string" } },
        experience: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              role: { type: "string" },
              organisation: { type: "string" },
              dates: { type: "string" },
              bullets: { type: "array", items: { type: "string" } }
            },
            required: ["role", "organisation", "dates", "bullets"]
          }
        },
        education: { type: "array", items: { type: "string" } },
        additionalSections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              heading: { type: "string" },
              items: { type: "array", items: { type: "string" } }
            },
            required: ["heading", "items"]
          }
        }
      },
      required: ["headline", "summary", "contact", "skills", "experience", "education", "additionalSections"]
    },
    coverLetter: {
      type: "object",
      additionalProperties: false,
      properties: {
        salutation: { type: "string" },
        paragraphs: { type: "array", items: { type: "string" } },
        closing: { type: "string" }
      },
      required: ["salutation", "paragraphs", "closing"]
    }
  },
  required: ["matchScore", "matchSummary", "resume", "coverLetter"]
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 16mm 17mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #17201d; font-family: "Aptos", "Segoe UI", sans-serif; font-size: 10.5pt; line-height: 1.42; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 2px; font-family: Georgia, serif; font-size: 25pt; letter-spacing: -0.6px; }
    h2 { margin: 17px 0 7px; padding-bottom: 4px; color: #146c5b; border-bottom: 1px solid #dce6e2; font-size: 10.5pt; letter-spacing: 1.2px; text-transform: uppercase; }
    h3 { margin-bottom: 2px; font-size: 11pt; }
    .eyebrow { color: #62706a; font-size: 9pt; letter-spacing: 0.8px; text-transform: uppercase; }
    .hero { padding: 15px 17px; border: 1px solid #dce6e2; border-radius: 16px; background: linear-gradient(135deg, #f7faf8, #edf6f2); }
    .headline { margin: 4px 0 0; color: #146c5b; font-weight: 650; }
    .contact { display: flex; flex-wrap: wrap; gap: 5px 13px; margin: 7px 0 0; color: #52615b; font-size: 8.8pt; }
    .contact span { white-space: nowrap; }
    .skills { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; list-style: none; }
    .skills li { padding: 4px 8px; border-radius: 999px; background: #eef4f1; color: #24473e; font-size: 9pt; }
    .role { margin-bottom: 12px; break-inside: avoid; }
    .meta { color: #62706a; font-size: 9pt; }
    ul { margin: 5px 0 0; padding-left: 18px; }
    li { margin: 2px 0; }
    .letter p { margin-bottom: 11px; }
    .date { color: #62706a; }
    .signature { margin-top: 20px; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

export function renderResumeHtml(application: TailoredApplication, context: DocumentContext): string {
  const contact = application.resume.contact.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const skills = application.resume.skills.map((skill) => `<li>${escapeHtml(skill)}</li>`).join("");
  const experience = application.resume.experience.map((item) => `
    <section class="role">
      <h3>${escapeHtml(item.role)} | ${escapeHtml(item.organisation)}</h3>
      <div class="meta">${escapeHtml(item.dates)}</div>
      <ul>${item.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
    </section>`).join("");
  const education = application.resume.education.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const additionalSections = application.resume.additionalSections.map((section) => `
    <section class="role">
      <h2>${escapeHtml(section.heading)}</h2>
      <ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>`).join("");

  const experienceSection = application.resume.experience.length > 0
    ? `<h2>Experience</h2>${experience}`
    : "";
  const educationSection = application.resume.education.length > 0
    ? `<h2>Education</h2><ul>${education}</ul>`
    : "";

  return pageShell(`${context.candidateName} CV`, `
    <header class="hero">
      <div class="eyebrow">Tailored for ${escapeHtml(context.title)} at ${escapeHtml(context.company)}</div>
      <h1>${escapeHtml(context.candidateName)}</h1>
      <p class="headline">${escapeHtml(application.resume.headline)}</p>
      <div class="contact">${contact}</div>
    </header>
    <h2>Profile</h2>
    <p>${escapeHtml(application.resume.summary)}</p>
    <h2>Core Skills</h2>
    <ul class="skills">${skills}</ul>
    ${experienceSection}
    ${educationSection}
    ${additionalSections}`);
}

export function renderCoverLetterHtml(application: TailoredApplication, context: DocumentContext): string {
  const paragraphs = application.coverLetter.paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  const date = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return pageShell(`${context.candidateName} Cover Letter`, `
    <header class="hero">
      <div class="eyebrow">Application for ${escapeHtml(context.title)}</div>
      <h1>${escapeHtml(context.candidateName)}</h1>
      <p class="headline">${escapeHtml(context.company)}</p>
    </header>
    <main class="letter">
      <p class="date">${escapeHtml(date)}</p>
      <p>${escapeHtml(application.coverLetter.salutation)},</p>
      ${paragraphs}
      <p class="signature">${escapeHtml(application.coverLetter.closing)},<br>${escapeHtml(context.candidateName)}</p>
    </main>`);
}

export function buildDocumentPrompt(profile: DesktopProfile, job: PersistedJob, cvMarkdown: string): string {
  return `You are the document preparation engine for My Job Finder.

MASTER CV MARKDOWN
${cvMarkdown}

Prepare a truthful tailored CV and cover letter for this job:
Company: ${job.company}
Title: ${job.title}
Location: ${job.location}
Description: ${job.description || job.excerpt}

Rules:
1. Use only facts, employers, dates, qualifications, skills, and achievements present in the master CV.
2. Never invent contact details, experience, metrics, certifications, tools, or responsibilities.
3. Preserve the candidate's real career chronology and job titles.
4. Tailor emphasis and wording to the role, but do not alter facts.
5. Keep the CV concise and ATS-readable. Use 3 to 6 bullets per relevant role.
6. Include only contact details present in the master CV. Return each as a short contact line.
7. Preserve relevant certifications, projects, languages, publications, or professional memberships in additionalSections. Use an empty array when none exist.
8. Write a specific cover letter with 3 to 5 short paragraphs.
9. Return only JSON matching the supplied schema.`;
}

interface CvSection {
  heading: string;
  items: string[];
}

const knownSectionHeadings = new Set([
  "profile", "summary", "about", "experience", "work experience", "employment history",
  "education", "qualifications", "contact", "contact details", "core fit", "core skills",
  "technical stack", "technical skills", "skills", "strengths", "domains", "selected work",
  "projects", "certifications", "certificates", "languages", "publications", "built products"
]);

function cleanCvLine(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[\u2022\u25AA\u25E6*-]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSectionHeading(line: string): boolean {
  const normalized = line.toLowerCase().replace(/:$/, "");
  if (knownSectionHeadings.has(normalized)) return true;
  const letters = line.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && line.length <= 48 && letters === letters.toUpperCase();
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.toLowerCase();
    if (!line || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseCvSections(cvMarkdown: string, candidateName: string): CvSection[] {
  const sections: CvSection[] = [];
  let current: CvSection = { heading: "Overview", items: [] };
  sections.push(current);

  for (const rawLine of cvMarkdown.split(/\r?\n/)) {
    if (/^##\s+Page\s+\d+/i.test(rawLine) || /^#\s+.+\s+CV\s*$/i.test(rawLine)) continue;
    const line = cleanCvLine(rawLine);
    if (!line || line.toLowerCase() === candidateName.toLowerCase()) continue;
    if (isSectionHeading(line)) {
      current = { heading: line.replace(/:$/, ""), items: [] };
      sections.push(current);
    } else {
      current.items.push(line);
    }
  }

  return sections
    .map((section) => ({ ...section, items: uniqueLines(section.items) }))
    .filter((section) => section.items.length > 0);
}

function sectionItems(sections: CvSection[], headings: RegExp): string[] {
  return uniqueLines(sections
    .filter((section) => headings.test(section.heading))
    .flatMap((section) => section.items));
}

function localTokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").split(/\s+/).filter((token) => token.length >= 3));
}

export function buildLocalApplication(
  profile: DesktopProfile,
  job: PersistedJob,
  cvMarkdown: string
): TailoredApplication {
  const sections = parseCvSections(cvMarkdown, profile.displayName);
  const contact = uniqueLines([
    ...sectionItems(sections, /contact/i),
    ...sections.flatMap((section) => section.items).filter((line) =>
      /@|https?:\/\/|linkedin\.com|github\.com|portfolio:|location:|\+?\d[\d ()-]{7,}/i.test(line)
    )
  ]).slice(0, 8);
  const skills = sectionItems(sections, /core fit|core skills|technical|skills|strengths/i).slice(0, 18);
  const education = sectionItems(sections, /education|qualification/i).slice(0, 16);
  const profileLines = sectionItems(sections, /profile|summary|about/i);
  const overviewLines = sectionItems(sections, /overview/i)
    .filter((line) => !contact.includes(line) && !/\bCV\b/i.test(line));
  const summary = (profileLines.length > 0 ? profileLines : overviewLines).slice(0, 5).join(" ")
    || `Application profile for ${job.title}. See the CV evidence below.`;
  const excludedHeadings = /contact|core fit|core skills|technical|skills|strengths|education|qualification|profile|summary|about|overview/i;
  const additionalSections = sections
    .filter((section) => !excludedHeadings.test(section.heading))
    .map((section) => ({ heading: section.heading, items: section.items }));
  if (additionalSections.length === 0) {
    const evidence = sections.flatMap((section) => section.items)
      .filter((line) => !contact.includes(line) && !education.includes(line) && !skills.includes(line));
    if (evidence.length > 0) additionalSections.push({ heading: "CV Evidence", items: uniqueLines(evidence) });
  }

  const jobTokens = localTokens(`${job.title} ${job.description || job.excerpt}`);
  const cvTokens = localTokens(cvMarkdown);
  const sharedTerms = [...jobTokens].filter((token) => cvTokens.has(token)).slice(0, 8);
  const matchScore = Math.max(0, Math.min(100, Math.round(job.score || 5 + sharedTerms.length * 8)));
  const skillEvidence = skills.slice(0, 5);
  const evidenceSentence = skillEvidence.length > 0
    ? `My CV documents experience and capability across ${skillEvidence.join(", ")}.`
    : "My attached CV sets out the experience and transferable capabilities relevant to this opportunity.";

  return {
    matchScore,
    matchSummary: `On-device preparation used ${sharedTerms.length} overlapping CV terms without adding unsupported facts.`,
    resume: {
      headline: [job.title, ...skills.slice(0, 3)].join(" | "),
      summary,
      contact,
      skills,
      experience: [],
      education,
      additionalSections
    },
    coverLetter: {
      salutation: "Dear Hiring Team",
      paragraphs: [
        `I am applying for the ${job.title} position at ${job.company}.`,
        evidenceSentence,
        "I would welcome the opportunity to discuss how the experience detailed in my CV can support the requirements of this role."
      ],
      closing: "Kind regards"
    }
  };
}

export interface DocumentPaths {
  directory: string;
  cvHtml: string;
  cvPdf: string;
  coverLetterHtml: string;
  coverLetterPdf: string;
}

export function shouldUseLocalPreparation(job: Pick<PersistedJob, "scoreReasons">, localOnly = false): boolean {
  return localOnly || job.scoreReasons.some((reason) => reason.startsWith("Local CV match:"));
}

export function documentPathsForJob(
  profile: DesktopProfile,
  job: PersistedJob,
  dataRoot: string,
  cvFingerprint = ""
): DocumentPaths {
  const readable = slugify(`${job.company}-${job.title}`).slice(0, 90) || "job";
  const identity = createHash("sha256")
    .update(`${documentTemplateVersion}:${profile.id}:${profile.displayName}:${job.id}:${cvFingerprint}`)
    .digest("hex")
    .slice(0, 10);
  const directory = path.resolve(dataRoot, "documents", "applications", `${readable}-${identity}`);
  return {
    directory,
    cvHtml: path.join(directory, "cv.html"),
    cvPdf: path.join(directory, "cv.pdf"),
    coverLetterHtml: path.join(directory, "cover-letter.html"),
    coverLetterPdf: path.join(directory, "cover-letter.pdf")
  };
}

async function renderPdf(browser: Browser, html: string, htmlPath: string, pdfPath: string): Promise<void> {
  ensureDirectory(htmlPath);
  writeFileSync(htmlPath, html, "utf8");
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

function systemChromiumPath(): string | undefined {
  const candidates = process.platform === "win32"
    ? [
        path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe")
      ]
    : process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/Applications/Chromium.app/Contents/MacOS/Chromium"
        ]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

export async function prepareApplicationDocuments(
  profile: DesktopProfile,
  jobs: PersistedJob[],
  dataRoot: string,
  onEvent: (event: DocumentGenerationEvent) => void = () => undefined,
  options: { localOnly?: boolean } = {}
): Promise<PersistedJob[]> {
  const eligible = jobs.filter((job) =>
    job.candidateProfile === profile.id &&
    job.score >= 50 &&
    job.status !== "expired" &&
    job.status !== "rejected_by_rules"
  );
  let browser: Browser | undefined;
  const updated = new Map(jobs.map((job) => {
    const isUnqualifiedDesktopJob =
      job.candidateProfile === profile.id &&
      job.score < 50 &&
      job.status !== "applied";
    return [job.id, isUnqualifiedDesktopJob ? { ...job, selectedCvPdf: "", selectedCoverLetterPdf: "" } : job];
  }));
  if (eligible.length === 0) return jobs.map((job) => updated.get(job.id) || job);

  if (!existsSync(profile.masterCvMarkdownPath)) {
    throw new Error("The extracted Markdown CV is missing. Save the profile again before generating documents.");
  }
  const cvMarkdown = readFileSync(profile.masterCvMarkdownPath, "utf8");
  const cvFingerprint = createHash("sha256").update(cvMarkdown).digest("hex").slice(0, 16);
  try {
    for (const job of eligible) {
      const output = documentPathsForJob(profile, job, dataRoot, cvFingerprint);
      if (existsSync(output.cvPdf) && existsSync(output.coverLetterPdf)) {
        updated.set(job.id, { ...job, selectedCvPdf: output.cvPdf, coverLetterRequired: true, selectedCoverLetterPdf: output.coverLetterPdf, lastError: "" });
        continue;
      }

      onEvent({ type: "document_started", jobId: job.id, message: `Preparing documents for ${job.title} at ${job.company}` });
      try {
        let usedLocalPreparation = shouldUseLocalPreparation(job, Boolean(options.localOnly));
        let application: TailoredApplication;
        if (usedLocalPreparation) {
          application = buildLocalApplication(profile, job, cvMarkdown);
        } else {
          try {
            application = await runCodexJson<TailoredApplication>({
              prompt: buildDocumentPrompt(profile, job, cvMarkdown),
              schema: outputSchema,
              workingDirectory: dataRoot,
              model: profile.aiModel,
              reasoningEffort: profile.reasoningEffort
            });
          } catch {
            usedLocalPreparation = true;
            application = buildLocalApplication(profile, job, cvMarkdown);
          }
        }
        const executablePath = systemChromiumPath();
        browser ||= await chromium.launch(executablePath
          ? { headless: true, executablePath }
          : { headless: true });
        const context = { candidateName: profile.displayName, company: job.company, title: job.title };
        await renderPdf(browser, renderResumeHtml(application, context), output.cvHtml, output.cvPdf);
        await renderPdf(browser, renderCoverLetterHtml(application, context), output.coverLetterHtml, output.coverLetterPdf);
        updated.set(job.id, {
          ...job,
          selectedCvPdf: output.cvPdf,
          coverLetterRequired: true,
          selectedCoverLetterPdf: output.coverLetterPdf,
          lastError: "",
          notes: [
            job.notes,
            `${usedLocalPreparation ? "On-device" : "AI-tailored"} documents: ${application.matchSummary}`
          ].filter(Boolean).join(" | ")
        });
        onEvent({
          type: "document_completed",
          jobId: job.id,
          message: `CV and cover letter ready for ${job.title}${usedLocalPreparation ? " using on-device preparation" : ""}`
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updated.set(job.id, {
          ...job,
          selectedCvPdf: "",
          selectedCoverLetterPdf: "",
          coverLetterRequired: true,
          lastError: `Document generation failed: ${message}`
        });
        onEvent({ type: "document_failed", jobId: job.id, message });
      }
    }
  } finally {
    await browser?.close();
  }

  return jobs.map((job) => updated.get(job.id) || job);
}
