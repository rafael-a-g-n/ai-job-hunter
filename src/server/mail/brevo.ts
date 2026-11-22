import type { MailMessage, Mailer } from "./mailer";
import { parseSender } from "./sender";

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/** Brevo transactional email API. Errors carry only the status, never the key or the message. */
export class BrevoMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async send(msg: MailMessage): Promise<void> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: parseSender(this.from),
          to: [{ email: msg.to }],
          subject: msg.subject,
          htmlContent: msg.html,
          textContent: msg.text,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) throw new Error(`Brevo request timed out after ${this.timeoutMs} ms`);
      throw new Error(`Brevo request failed: ${err instanceof Error ? err.name : "unknown error"}`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`Brevo failed with HTTP status ${res.status}`);
  }
}
