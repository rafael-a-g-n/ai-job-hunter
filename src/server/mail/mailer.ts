import { env } from "@/lib/env";
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
  cached ??=
    env.MAIL_PROVIDER === "resend"
      ? new ResendMailer(env.RESEND_API_KEY ?? "", env.EMAIL_FROM)
      : new ConsoleMailer();
  return cached;
}
