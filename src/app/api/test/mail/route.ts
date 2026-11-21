import { connection, type NextRequest } from "next/server";
import { sentMessages } from "@/server/mail/console";

/**
 * E2E-only: returns the messages the console mailer "sent" (it keeps them in server memory), so
 * browser tests can read verification and reset links.
 *
 * Gate: `E2E=1` AND `MAIL_PROVIDER=console`, otherwise 404. `NODE_ENV` cannot be the gate because
 * the e2e server runs `next start` (NODE_ENV=production). The console mailer is never configured in
 * a real deployment (production uses Resend), and E2E is set only by the Playwright config, so the
 * route does not exist anywhere real. Optional `?to=` filters by recipient.
 */
export async function GET(req: NextRequest): Promise<Response> {
  await connection();
  if (process.env.E2E !== "1" || process.env.MAIL_PROVIDER !== "console") {
    return new Response("Not found", { status: 404 });
  }
  const to = req.nextUrl.searchParams.get("to");
  const messages = to ? sentMessages.filter((m) => m.to === to) : sentMessages;
  return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
