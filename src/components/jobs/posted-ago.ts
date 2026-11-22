/** "Posted today", "Posted 3 days ago", ... `now` is passed in to keep this pure. */
export function postedAgo(postedAt: Date | null, now: Date): string {
  if (!postedAt) return "Date unknown";
  const days = Math.floor((now.getTime() - postedAt.getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  if (days < 14) return `Posted ${days} days ago`;
  if (days < 60) return `Posted ${Math.floor(days / 7)} weeks ago`;
  return `Posted ${Math.floor(days / 30)} months ago`;
}

const SOURCE_LABELS: Record<string, string> = {
  ADZUNA: "Adzuna",
  ARBEITNOW: "Arbeitnow",
  REMOTIVE: "Remotive",
  HIMALAYAS: "Himalayas",
  JOBICY: "Jobicy",
  MANUAL: "Pasted by you",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** Home page of each external source; their terms ask for a visible credit that links there. */
const SOURCE_SITES: Record<string, string> = {
  ADZUNA: "https://www.adzuna.com",
  ARBEITNOW: "https://www.arbeitnow.com",
  HIMALAYAS: "https://himalayas.app",
  JOBICY: "https://jobicy.com",
  REMOTIVE: "https://remotive.com",
};

/** The source's home page, or null for jobs without an external source (pasted by the user). */
export function sourceSite(source: string): string | null {
  return SOURCE_SITES[source] ?? null;
}
