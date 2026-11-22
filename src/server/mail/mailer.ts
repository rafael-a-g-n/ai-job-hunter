import { env } from "@/lib/env";
import { BrevoMailer } from "./brevo";
import { ConsoleMailer } from "./console";
import { ResendMailer } from "./resend";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

let cached: Mailer | undefined;

export function getMailer(): Mailer {
  cached ??= createMailer();
  return cached;
}

function createMailer(): Mailer {
  switch (env.MAIL_PROVIDER) {
    case "resend":
      return new ResendMailer(env.RESEND_API_KEY ?? "", env.EMAIL_FROM);
    case "brevo":
      return new BrevoMailer(env.BREVO_API_KEY ?? "", env.EMAIL_FROM);
    default:
      return new ConsoleMailer();
  }
}
