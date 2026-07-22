import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import mammoth from "mammoth";

import { ensureDirectory } from "../utils.js";

function normalizePageText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function formatExtractedPagesAsMarkdown(title: string, pages: string[]): string {
  const safeTitle = title.replace(/[#\r\n]+/g, " ").replace(/\s+/g, " ").trim() || "Candidate";
  const body = pages
    .map((page, index) => `## Page ${index + 1}\n\n${normalizePageText(page)}`)
    .join("\n\n");
  return `# ${safeTitle} CV\n\n${body}\n`;
}

async function extractPdfPages(filePath: string): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({
    data: new Uint8Array(readFileSync(filePath)),
    useSystemFonts: true,
    disableFontFace: true
  }).promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const text = item.str.trim();
        if (text) line += `${line ? " " : ""}${text}`;
        if (item.hasEOL && line) {
          lines.push(line);
          line = "";
        }
      }
      if (line) lines.push(line);
      pages.push(lines.join("\n"));
      page.cleanup();
    }
  } finally {
    await document.cleanup();
  }

  return pages;
}

export async function extractCvToMarkdown(
  sourcePath: string,
  outputPath: string,
  candidateName: string
): Promise<string> {
  const extension = path.extname(sourcePath).toLowerCase();
  let pages: string[];

  if (extension === ".pdf") {
    pages = await extractPdfPages(sourcePath);
  } else if (extension === ".docx") {
    const result = await mammoth.extractRawText({ path: sourcePath });
    pages = [result.value];
  } else if ([".txt", ".md"].includes(extension)) {
    pages = [readFileSync(sourcePath, "utf8")];
  } else {
    throw new Error(`Unsupported CV format: ${extension || "unknown"}. Choose PDF, DOCX, TXT, or Markdown.`);
  }

  const extractedCharacters = pages.reduce((total, page) => total + page.replace(/\s/g, "").length, 0);
  if (extractedCharacters < 40) {
    throw new Error("The uploaded CV does not contain enough selectable text. Export it as a text-based PDF or DOCX and try again.");
  }

  const markdown = formatExtractedPagesAsMarkdown(candidateName, pages);
  ensureDirectory(outputPath);
  writeFileSync(outputPath, markdown, "utf8");
  return markdown;
}
