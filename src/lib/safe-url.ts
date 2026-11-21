/** Returns the URL only when it is absolute http: or https:, otherwise null. Use before putting a URL in an href. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const DEFAULT_NEXT = "/dashboard";
const PROBE_ORIGIN = "https://app.invalid";
// Backslashes (browsers treat "/\" like "//") and control characters (tabs and newlines are
// stripped by URL parsers, so "/\t/evil.com" becomes "//evil.com").
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f]/;

/**
 * A post-login target: only a same-origin relative path, otherwise "/dashboard". Rejects
 * protocol-relative paths, backslashes and control characters (also percent-encoded), and
 * anything that resolves to another origin.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_NEXT;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_NEXT;
  }
  if (UNSAFE_CHARS.test(raw) || UNSAFE_CHARS.test(decoded) || decoded.startsWith("//")) {
    return DEFAULT_NEXT;
  }
  try {
    return new URL(raw, PROBE_ORIGIN).origin === PROBE_ORIGIN ? raw : DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
}
