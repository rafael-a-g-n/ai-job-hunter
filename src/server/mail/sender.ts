export interface Sender {
  name?: string;
  email: string;
}

/** Parse `Name <email>` or a bare email (the `EMAIL_FROM` format). */
export function parseSender(from: string): Sender {
  const m = from.trim().match(/^(.*?)\s*<([^<>]+)>$/);
  if (!m) return { email: from.trim() };
  const name = m[1]
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim();
  const email = m[2].trim();
  return name ? { name, email } : { email };
}
