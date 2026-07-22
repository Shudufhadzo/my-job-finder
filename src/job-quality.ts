import type { DiscoveredJob } from "./types.js";

export interface ListingQualityAssessment {
  isGroupedListing: boolean;
  reasons: string[];
}

const groupedTitlePatterns = [
  /\b\d[\d,\s]*\s+[\w/& -]*jobs?\s+in\b/i,
  /\bjobs?\s+in\s+[a-z][a-z\s,&./-]+(?:\||$)/i,
  /\bcurrent vacancies\b/i,
  /\bjobs by title\b/i,
  /\bremote [\w\s/&-]* jobs\b/i,
  /\burgent!\b.*\bjobs?\b/i,
  /\b[a-z][\w/& -]*jobs?\s+in\s+south africa\b/i
];

const groupedBodyPatterns = [
  /\bfound\s+\d[\d,\s]*\s+jobs\b/i,
  /\bjobs?\s+available\b/i,
  /\bcurrent vacancies\b/i,
  /\bbrowse latest roles\b/i,
  /\bapply for positions such as\b/i,
  /\bsign in to create job alert\b/i,
  /\bget notified when a new job is posted\b/i,
  /\bjobs by city\b/i,
  /\bjobs by province\b/i,
  /\bjobs by industry\b/i,
  /\bjobs by location\b/i,
  /\bupload your cv\b/i,
  /\badvanced search\b/i
];

const groupedUrlPatterns = [
  /linkedin\.com\/jobs\/[^/]+-jobs\b/i,
  /pnet\.co\.za\/jobs\/[^/?#]+$/i,
  /jobsora\./i,
  /myjobmag\./i,
  /dailyremote\.com\/remote-[^/]+-jobs/i,
  /clickajobs\./i
];

function normalizeText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function assessListingQuality(
  job: Pick<DiscoveredJob, "title" | "url" | "applyUrl" | "description" | "excerpt">
): ListingQualityAssessment {
  const title = normalizeText(job.title);
  const body = normalizeText(`${job.description} ${job.excerpt}`);
  const url = normalizeText(job.applyUrl || job.url);
  const reasons: string[] = [];

  if (groupedTitlePatterns.some((pattern) => pattern.test(title))) {
    reasons.push("title looks like an aggregate jobs page");
  }

  if (groupedBodyPatterns.some((pattern) => pattern.test(body))) {
    reasons.push("page copy looks like a grouped listing or job directory");
  }

  if (groupedUrlPatterns.some((pattern) => pattern.test(url))) {
    reasons.push("URL matches a grouped search/listing pattern");
  }

  return {
    isGroupedListing: reasons.length > 0,
    reasons
  };
}
