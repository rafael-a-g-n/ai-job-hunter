/** The tags our prompts use to fence untrusted text. */
const DELIMITER_TAG = /<[/]?[ ]*(profile|job|cv|posting)(?![a-z])[^>]*>/gi;

/**
 * Removes our delimiter tags from untrusted text (CV text, job postings, profile fields), so it
 * cannot close its block early and smuggle instructions outside it.
 */
export function defang(text: string): string {
  return text.replace(DELIMITER_TAG, "");
}

/** Defangs and truncates a short untrusted field such as a job title or company name. */
export function defangField(text: string, maxChars = 200): string {
  return defang(text).slice(0, maxChars);
}
