import type { DiscoveredJob, JobField } from "./types.js";
const fieldDefinitions: Array<{ field: JobField; patterns: RegExp[] }> = [
  {
    field: "engineering",
    patterns: [
      /\bengineering\b/i,
      /\bengineer\b/i,
      /\belectrical\b/i,
      /\bindustrial\b/i,
      /\bsection engineer\b/i,
      /\bprocess engineer\b/i,
      /\bproject engineer\b/i,
      /\belectrical design\b/i,
      /\bmaintenance engineer\b/i,
      /\bplant engineer\b/i,
      /\breliability engineer\b/i,
      /\belectrical and instrumentation\b/i,
      /\belectronics engineer\b/i,
      /\bfield service engineer\b/i,
      /\be&i\b/i,
      /\binstrumentation\b/i,
      /\bmaintenance\b/i,
      /\bplant\b/i,
      /\breliability\b/i,
      /\bpower quality\b/i,
      /\bscada\b/i,
      /\bplc\b/i,
      /\butilities\b/i
    ]
  },
  {
    field: "data_science",
    patterns: [
      /\bdata scientist\b/i,
      /\bmachine learning\b/i,
      /\bml engineer\b/i,
      /\bmodel(?:ling|ing)?\b/i,
      /\bscorecard\b/i,
      /\bstatistical\b/i,
      /\brisk model\b/i
    ]
  },
  {
    field: "data_analytics",
    patterns: [
      /\bdata analyst\b/i,
      /\banalytics\b/i,
      /\bbusiness intelligence\b/i,
      /\bbi analyst\b/i,
      /\bpower bi\b/i,
      /\breporting\b/i,
      /\bdashboard\b/i,
      /\binsights?\b/i
    ]
  },
  {
    field: "fintech",
    patterns: [
      /\bfintech\b/i,
      /\bfinancial\b/i,
      /\bfinance\b/i,
      /\bbanking\b/i,
      /\bcredit\b/i,
      /\blending\b/i,
      /\bloan\b/i,
      /\bpayments?\b/i,
      /\binsurance\b/i,
      /\bfraud\b/i,
      /\brisk\b/i
    ]
  },
  {
    field: "crypto",
    patterns: [
      /\bcrypto\b/i,
      /\bblockchain\b/i,
      /\bweb3\b/i,
      /\bon[- ]?chain\b/i,
      /\bdefi\b/i,
      /\bbitcoin\b/i,
      /\btoken\b/i
    ]
  },
  {
    field: "mining",
    patterns: [
      /\bmining\b/i,
      /\bcement\b/i,
      /\bplant\b/i,
      /\bkiln\b/i,
      /\beskom\b/i,
      /\bmanufacturing\b/i,
      /\butilities\b/i,
      /\bheavy industrial\b/i,
      /\bmineral\b/i,
      /\bcement\b/i
    ]
  },
  {
    field: "project_management",
    patterns: [
      /\bproject (?:manager|management|coordinator|administrator|assistant|officer)\b/i,
      /\bprogramme (?:manager|management|coordinator|administrator|assistant|officer)\b/i,
      /\bpmo\b/i,
      /\bproject planning\b/i,
      /\bproject schedules?\b/i,
      /\bstakeholder coordination\b/i
    ]
  },
  {
    field: "education_training",
    patterns: [
      /\bteacher\b/i,
      /\beducator\b/i,
      /\beducation\b/i,
      /\bteaching\b/i,
      /\btraining\b/i,
      /\blearning and development\b/i,
      /\bcurriculum\b/i,
      /\bassessment\b/i,
      /\bstudent support\b/i,
      /\bschool\b/i
    ]
  },
  {
    field: "administration",
    patterns: [
      /\badministrator\b/i,
      /\badministration\b/i,
      /\brecord keeping\b/i,
      /\bdocumentation\b/i,
      /\breporting\b/i,
      /\bscheduling\b/i,
      /\bcoordinator\b/i
    ]
  }
];

export const jobFieldOrder: JobField[] = [
  "engineering",
  "data_science",
  "data_analytics",
  "fintech",
  "crypto",
  "mining",
  "project_management",
  "education_training",
  "administration"
];

export function formatJobField(field: JobField): string {
  switch (field) {
    case "engineering":
      return "Engineering";
    case "data_science":
      return "Data Science";
    case "data_analytics":
      return "Data Analytics";
    case "fintech":
      return "Fintech";
    case "crypto":
      return "Crypto";
    case "mining":
      return "Mining";
    case "project_management":
      return "Project Management";
    case "education_training":
      return "Education & Training";
    case "administration":
      return "Administration";
  }
}

export function inferJobFields(
  job: Pick<DiscoveredJob, "title" | "company" | "location" | "description" | "sourceQuery">
): JobField[] {
  const haystack = [
    job.title,
    job.company,
    job.location,
    job.description
  ]
    .join(" ")
    .toLowerCase();

  const matches: JobField[] = fieldDefinitions
    .filter((definition) => definition.patterns.some((pattern) => pattern.test(haystack)))
    .map((definition) => definition.field);

  if (/\banalytics engineer\b/i.test(haystack) || /\bdata engineer\b/i.test(haystack)) {
    matches.push("engineering", "data_analytics");
  }

  if (/\bcredit risk\b/i.test(haystack)) {
    matches.push("data_science", "fintech");
  }

  const deduped = [...new Set(matches)] as JobField[];

  return deduped.sort(
    (left, right) => jobFieldOrder.indexOf(left) - jobFieldOrder.indexOf(right)
  );
}
