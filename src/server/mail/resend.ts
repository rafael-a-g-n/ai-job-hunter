import { Resend } from "resend";
import type { MailMessage, Mailer } from "./mailer";

export class ResendMailer implements Mailer {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(msg: MailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    if (error) throw new Error(`Resend failed: ${error.message}`);
  }
}
