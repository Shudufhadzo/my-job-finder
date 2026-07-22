import * as cheerio from "cheerio";

import { loadSearchConfig } from "./config.js";
import { assessListingQuality } from "./job-quality.js";
import { detectPlatformFamily, extractApplyUrlFromHtml, safeHostname } from "./platforms.js";
import type { CandidateProfileId, DiscoveredJob } from "./types.js";
import { normalizeWhitespace, slugify, toIsoNow, truncate } from "./utils.js";

const searchBaseUrl = "https://html.duckduckgo.com/html/";
const linkedinGuestSearchUrl =
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";

function decodeDuckDuckGoHref(href: string): string {
  try {
    const url = new URL(href, searchBaseUrl);
    const redirectTarget = url.searchParams.get("uddg");
    return redirectTarget ? decodeURIComponent(redirectTarget) : href;
  } catch {
    return href;
  }
}

function canonicalizeJobUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);

    if (url.hostname.includes("linkedin.com") && url.pathname.includes("/jobs/view/")) {
      url.search = "";
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url} with status ${response.status}`);
  }

  return response.text();
}

interface LinkedInGuestCard {
  title: string;
  company: string;
  location: string;
  url: string;
}

function parseLinkedInGuestCards(html: string): LinkedInGuestCard[] {
  const $ = cheerio.load(html);

  return $("li")
    .map((_, element) => {
      const root = $(element);
      const url = canonicalizeJobUrl(root.find("a.base-card__full-link").attr("href") ?? "");
      const title = normalizeWhitespace(root.find(".base-search-card__title").text());
      const company = normalizeWhitespace(root.find(".base-search-card__subtitle").text());
      const location = normalizeWhitespace(root.find(".job-search-card__location").text());

      if (!url || !title || !company) {
        return null;
      }

      return {
        title,
        company,
        location,
        url
      };
    })
    .get()
    .filter(Boolean) as LinkedInGuestCard[];
}

function extractJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  return $('script[type="application/ld+json"]')
    .map((_, element) => {
      const raw = $(element).contents().text();
      if (!raw.trim()) {
        return null;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed[0] as Record<string, unknown>;
        }

        return parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .get()
    .filter(Boolean) as Record<string, unknown>[];
}

function asString(value: unknown): string {
  return typeof value === "string" ? normalizeWhitespace(value) : "";
}

function textFromHtml($: cheerio.CheerioAPI): string {
  return normalizeWhitespace($("body").text());
}

function guessStatus(pageText: string): string {
  const lowered = pageText.toLowerCase();

  if (/(no longer accepting|expired|job is no longer available|position has been filled)/.test(lowered)) {
    return "Closed";
  }

  return "Open";
}

function isLikelyListingPage(title: string, bodyText: string, hasJobPostingJsonLd: boolean): boolean {
  const titleText = title.toLowerCase();
  const body = bodyText.toLowerCase();

  const looksLikeDirectory =
    /\bjobs\b|\bvacancies\b|view all jobs|application tracker|job category|search jobs/.test(titleText) ||
    /\bfound \d+ jobs\b|upload your cv|application tracker|top remote companies hiring/.test(body);

  if (looksLikeDirectory) {
    return true;
  }

  return !hasJobPostingJsonLd && /sign in to create job alert|get notified when a new job is posted/.test(body);
}

async function hydrateJob(
  url: string,
  sourceQuery: string,
  candidateProfile: CandidateProfileId
): Promise<DiscoveredJob | null> {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const jsonLd = extractJsonLd($).find((item) => item["@type"] === "JobPosting");
    const bodyText = textFromHtml($);
    const title =
      asString(jsonLd?.title) ||
      asString($('meta[property="og:title"]').attr("content")) ||
      normalizeWhitespace($("title").text());
    const company =
      asString((jsonLd?.hiringOrganization as Record<string, unknown> | undefined)?.name) ||
      asString($('meta[property="og:site_name"]').attr("content")) ||
      safeHostname(url);
    const location =
      asString(
        ((jsonLd?.jobLocation as Record<string, unknown> | undefined)?.address as Record<string, unknown> | undefined)
          ?.addressLocality
      ) ||
      asString(
        ((jsonLd?.jobLocation as Record<string, unknown> | undefined)?.address as Record<string, unknown> | undefined)
          ?.addressRegion
      ) ||
      (bodyText.toLowerCase().includes("remote") ? "Remote" : "");
    const description = asString(jsonLd?.description) || truncate(bodyText, 2500);
    const excerpt = truncate(description, 320);
    const now = toIsoNow();

    if (!title || title.toLowerCase() === "duckduckgo") {
      return null;
    }

    const quality = assessListingQuality({
      title,
      url,
      applyUrl: url,
      description,
      excerpt
    });

    if (quality.isGroupedListing) {
      return null;
    }

    if (isLikelyListingPage(title, bodyText, Boolean(jsonLd))) {
      return null;
    }

    const applyUrl = extractApplyUrlFromHtml($, url);
    const platform = safeHostname(applyUrl || url);
    const platformFamily = detectPlatformFamily(applyUrl || url);

    return {
      id: slugify(`${company}-${title}-${url}`),
      candidateProfile,
      source: "search",
      sourceQuery,
      title,
      company,
      location,
      employmentType: asString(jsonLd?.employmentType),
      currentStatus: guessStatus(bodyText),
      url,
      applyUrl,
      platform,
      platformFamily,
      description,
      excerpt,
      datePosted: asString(jsonLd?.datePosted) || undefined,
      lastSeenAt: now,
      cvRequired: true,
      notes: "discovered from search"
    };
  } catch {
    return null;
  }
}

function buildLinkedInGuestSearchParameters(query: string): URLSearchParams {
  const lowered = query.toLowerCase();
  let keywords = query;
  let location = "";

  if (lowered.includes("johannesburg")) {
    location = "Johannesburg, Gauteng, South Africa";
    keywords = keywords.replace(/johannesburg/gi, "");
  } else if (lowered.includes("cape town")) {
    location = "Cape Town, Western Cape, South Africa";
    keywords = keywords.replace(/cape town/gi, "");
  } else if (lowered.includes("south africa")) {
    location = "South Africa";
    keywords = keywords.replace(/south africa/gi, "");
  } else if (lowered.includes("africa") && !lowered.includes("remote")) {
    location = "Africa";
    keywords = keywords.replace(/africa/gi, "");
  } else if (lowered.includes("emea") && !lowered.includes("remote")) {
    location = "EMEA";
    keywords = keywords.replace(/emea/gi, "");
  }

  keywords = keywords.replace(/\bremote\b/gi, " ").replace(/\s+/g, " ").trim();

  const params = new URLSearchParams({
    keywords
  });

  if (location) {
    params.set("location", location);
  }

  return params;
}

export async function enrichJobWithApplyUrl(job: DiscoveredJob): Promise<DiscoveredJob> {
  if (!job.url || job.applyUrl !== job.url) {
    return job;
  }

  try {
    const html = await fetchHtml(job.url);
    const $ = cheerio.load(html);
    const bodyText = textFromHtml($);
    const applyUrl = extractApplyUrlFromHtml($, job.url);

    return {
      ...job,
      applyUrl,
      platform: safeHostname(applyUrl || job.url),
      platformFamily: detectPlatformFamily(applyUrl || job.url),
      currentStatus: guessStatus(bodyText)
    };
  } catch {
    return job;
  }
}

export async function searchWebForJobs(
  candidateProfile: CandidateProfileId
): Promise<DiscoveredJob[]> {
  const config = loadSearchConfig(candidateProfile);
  const jobs: DiscoveredJob[] = [];
  const ignoredDomains = ["jobsora.", "pnet.co.za", "myjobmag.", "dailyremote.com", "clickajobs."];

  for (const query of config.queries) {
    let html = "";
    try {
      const url = `${searchBaseUrl}?q=${encodeURIComponent(query + " job apply")}`;
      html = await fetchHtml(url);
    } catch {
      continue;
    }

    const $ = cheerio.load(html);

    const resultUrls = $(".result__a")
      .map((_, element) => $(element).attr("href"))
      .get()
      .filter(Boolean)
      .map((href) => decodeDuckDuckGoHref(href))
      .filter((href) => /^https?:\/\//.test(href))
      .filter((href) => {
        const lowered = href.toLowerCase();
        return (
          lowered.includes("jobs") ||
          lowered.includes("job-detail") ||
          lowered.includes("/job/") ||
          lowered.includes("vacanc") ||
          lowered.includes("careers") ||
          lowered.includes("greenhouse") ||
          lowered.includes("lever") ||
          lowered.includes("ashby") ||
          lowered.includes("linkedin") ||
          lowered.includes("workday") ||
          lowered.includes("bamboohr") ||
          lowered.includes("smartrecruiters") ||
          lowered.includes("job-boards")
        );
      })
      .filter((href) => ignoredDomains.every((domain) => !href.toLowerCase().includes(domain)))
      .slice(0, config.maxResultsPerQuery);

    for (const resultUrl of resultUrls) {
      const job = await hydrateJob(resultUrl, query, candidateProfile);
      if (job) {
        jobs.push(job);
      }
    }
  }

  for (const query of config.queries) {
    const seenUrls = new Set<string>();

    for (const start of [0, 25, 50]) {
      if (seenUrls.size >= config.maxResultsPerQuery) {
        break;
      }

      const params = buildLinkedInGuestSearchParameters(query);
      params.set("start", String(start));
      const url = `${linkedinGuestSearchUrl}?${params.toString()}`;
      let html = "";
      try {
        html = await fetchHtml(url);
      } catch {
        break;
      }

      const cards = parseLinkedInGuestCards(html);

      if (cards.length === 0) {
        break;
      }

      for (const card of cards) {
        if (seenUrls.size >= config.maxResultsPerQuery) {
          break;
        }

        if (seenUrls.has(card.url)) {
          continue;
        }

        seenUrls.add(card.url);
        const job = await hydrateJob(card.url, query, candidateProfile);
        if (job) {
          jobs.push(job);
        }
      }
    }
  }

  return [
    ...new Map(
      jobs.map((job) => [
        `${slugify(job.company)}-${slugify(job.title)}-${canonicalizeJobUrl(job.url)}`,
        job
      ])
    ).values()
  ];
}
