import type { MailMessage } from "./mailer";

type Template = Pick<MailMessage, "subject" | "html" | "text">;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(intro: string, cta: string, url: string): Pick<Template, "html" | "text"> {
  const safe = escapeHtml(url);
  return {
    html: `<p>${intro}</p><p><a href="${safe}">${cta}</a></p><p>If the button does not work, copy this link into your browser:<br>${safe}</p><p>If you did not request this, you can ignore this email.</p>`,
    text: `${intro}\n\n${cta}: ${url}\n\nIf you did not request this, you can ignore this email.`,
  };
}

export function verificationEmail(url: string): Template {
  return {
    subject: "Verify your email for AI Job Hunter",
    ...layout("Welcome to AI Job Hunter. Please confirm your email address.", "Verify email", url),
  };
}

export function resetPasswordEmail(url: string): Template {
  return {
    subject: "Reset your AI Job Hunter password",
    ...layout("We received a request to reset your password.", "Reset password", url),
  };
}
