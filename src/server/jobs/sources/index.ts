import { adzunaAdapterFromEnv } from "./adzuna";
import { arbeitnowAdapter } from "./arbeitnow";
import { remotiveAdapter } from "./remotive";
import type { JobSourceAdapter } from "./types";

export type { JobSourceAdapter, NormalizedJob } from "./types";
export { computeDedupeHash } from "./util";
export { SOURCES_CONFIG } from "./config";

/** Adzuna is only enabled when both of its keys are set. */
export function getEnabledAdapters(): JobSourceAdapter[] {
  const adzuna = adzunaAdapterFromEnv();
  return [...(adzuna ? [adzuna] : []), arbeitnowAdapter, remotiveAdapter];
}
