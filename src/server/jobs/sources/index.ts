import { env, type JobSourceName } from "@/lib/env";
import { adzunaAdapterFromEnv } from "./adzuna";
import { arbeitnowAdapter } from "./arbeitnow";
import { himalayasAdapterFromEnv } from "./himalayas";
import { jobicyAdapterFromEnv } from "./jobicy";
import { remotiveAdapterFromEnv } from "./remotive";
import type { JobSourceAdapter } from "./types";

export type { JobSourceAdapter, NormalizedJob } from "./types";
export { computeDedupeHash } from "./util";
export { SOURCES_CONFIG } from "./config";

/**
 * One line per source: how to build its adapter. Adding a source means adding its name to
 * JOB_SOURCE_NAMES (src/lib/env.ts) and a line here. A builder may return null when the source
 * is not usable (Adzuna without its keys).
 */
const REGISTRY: Record<JobSourceName, () => JobSourceAdapter | null> = {
  himalayas: himalayasAdapterFromEnv,
  remotive: remotiveAdapterFromEnv,
  jobicy: jobicyAdapterFromEnv,
  arbeitnow: () => arbeitnowAdapter,
  adzuna: adzunaAdapterFromEnv,
};

/** The sources listed in JOB_SOURCES (Adzuna additionally needs both of its keys). */
export function getEnabledAdapters(): JobSourceAdapter[] {
  return env.JOB_SOURCES.flatMap((name) => REGISTRY[name]() ?? []);
}
