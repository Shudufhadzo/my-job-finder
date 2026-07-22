import * as cheerio from "cheerio";

import type { PlatformFamily } from "./types.js";
import { normalizeWhitespace } from "./utils.js";

export function detectPlatformFamily(url: string): PlatformFamily {
  const lowered = url.toLowerCase();

  if (lowered.includes("jobs.ashbyhq.com")) {
    return "ashby";
  }

  if (lowered.includes("greenhouse")) {
    return "greenhouse";
  }

  if (lowered.includes("bamboohr")) {
    return "bamboohr";
  }

  if (lowered.includes("lever.co")) {
    return "lever";
  }

  if (lowered.includes("workday")) {
    return "workday";
  }

  if (lowered.includes("upwork.com")) {
    return "upwork";
  }

  if (lowered.includes("linkedin.com")) {
    return "linkedin";
  }

  return "generic";
}

function resolveHref(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

export function isBadApplyUrl(url: string): boolean {
  return /request-password-reset|public_jobs_sub-nav-cta-optional-url|\/company\/|\/mycompany\/|linkedin\.com\/in\/|session_redirect|cold-join|linkedin\.com\/jobs\/(?!view\/)[^/?#]+-jobs\b|linkedin\.com\/jobs\/search/i.test(
    url
  );
}

export function extractApplyUrlFromHtml($: cheerio.CheerioAPI, baseUrl: string): string {
  let bestUrl = baseUrl;
  let bestScore = -1;
  const baseFamily = detectPlatformFamily(baseUrl);

  $("a[href]")
    .toArray()
    .forEach((element) => {
      const href = resolveHref($(element).attr("href") ?? "", baseUrl);
      if (!/^https?:\/\//i.test(href)) {
        return;
      }

      if (isBadApplyUrl(href)) {
        return;
      }

      const text = normalizeWhitespace($(element).text());
      const family = detectPlatformFamily(href);
      const hostChanged = safeHostname(href) !== safeHostname(baseUrl);
      const hasApplyCue = /apply|submit|position|role/i.test(text);
      let score = 0;

      if (hasApplyCue) {
        score += 10;
      }

      if (family !== "generic") {
        score += 12;
      }

      if (hostChanged) {
        score += 4;
      }

      if (/#app\b/i.test(href)) {
        score += 3;
      }

      if (/privacy|policy|terms|alert|sign in|login|register/i.test(`${text} ${href}`)) {
        score -= 20;
      }

      if (/signup|sign-up|cold-join|session_redirect|register/i.test(href)) {
        score -= 40;
      }

      if (!hasApplyCue && !hostChanged && family === baseFamily) {
        score -= 25;
      }

      if (score <= 0) {
        return;
      }

      if (score > bestScore) {
        bestScore = score;
        bestUrl = href;
      }
    });

  return bestUrl;
}

export function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
