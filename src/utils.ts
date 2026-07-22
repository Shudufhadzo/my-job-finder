import { mkdirSync } from "node:fs";
import path from "node:path";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function slugify(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toIsoNow(): string {
  return new Date().toISOString();
}

export function ensureDirectory(fileOrDirectoryPath: string): void {
  const directory = path.extname(fileOrDirectoryPath)
    ? path.dirname(fileOrDirectoryPath)
    : fileOrDirectoryPath;
  mkdirSync(directory, { recursive: true });
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

export function daysSince(dateIso: string | undefined): number | undefined {
  if (!dateIso) {
    return undefined;
  }

  const timestamp = Date.parse(dateIso);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}
