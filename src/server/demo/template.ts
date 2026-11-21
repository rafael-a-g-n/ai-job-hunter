import { DemoTemplate } from "./template-schema";
import data from "./template-data.json";

export { DemoTemplate } from "./template-schema";

let cached: DemoTemplate | undefined;

/** The validated template shipped in template-data.json. Throws if the file is malformed. */
export function loadDemoTemplate(): DemoTemplate {
  cached ??= DemoTemplate.parse(data);
  return cached;
}

/** Dedupe hashes of every job the template points at (saved jobs, scored matches, the letter). */
export function templateJobHashes(): string[] {
  const t = loadDemoTemplate();
  return [
    ...new Set([
      ...t.savedJobDedupeHashes,
      ...(t.matches ?? []).map((m) => m.jobDedupeHash),
      t.letter.jobDedupeHash,
    ]),
  ];
}

/** True for a CV cloned from the template (same extracted text), i.e. not the user's own CV. */
export function isTemplateCv(cv: { rawText: string | null }): boolean {
  return cv.rawText !== null && cv.rawText === loadDemoTemplate().cv.rawText;
}
