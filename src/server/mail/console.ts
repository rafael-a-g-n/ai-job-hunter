import type { MailMessage, Mailer } from "./mailer";

/** Every message the console mailer has "sent" (tests and e2e read this). */
export const sentMessages: MailMessage[] = [];

export class ConsoleMailer implements Mailer {
  constructor(private readonly log: (line: string) => void = (l) => console.log(l)) {}

  async send(msg: MailMessage): Promise<void> {
    sentMessages.push(msg);
    this.log(`[mail] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  }
}
