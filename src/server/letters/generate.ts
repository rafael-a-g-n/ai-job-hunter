import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { describeError } from "@/server/ai/deps";
import { streamAiText } from "@/server/ai/stream";
import { getActiveCv } from "@/server/cv/queries";
import { CvProfile } from "@/server/cv/schemas";
import { getJob } from "@/server/jobs/search";
import { consumeUsage, refundUsage } from "@/server/limits/usage";
import { MAX_LETTER_CHARS } from "./crud";
import { buildLetterPrompt, type LetterOptions } from "./prompts";

export const LETTER_ID_HEADER = "X-Letter-Id";

/**
 * Streams a cover letter as plain text. The letter id is chosen up front and sent in the
 * `X-Letter-Id` header; the row is saved before the stream closes, so when the client sees the
 * stream end the letter exists. A failed or aborted stream saves nothing and refunds the usage.
 */
export async function streamLetter(
  user: { id: string; isDemo: boolean },
  input: { jobId: string } & LetterOptions,
): Promise<Response> {
  const cv = await getActiveCv(user.id);
  if (!cv || cv.status !== "ANALYZED" || !cv.profile) {
    throw new AppError("CV_NOT_READY", "Analyze your CV first.");
  }
  const profile = CvProfile.parse(cv.profile);
  const job = await getJob(user.id, input.jobId);
  const { system, prompt } = buildLetterPrompt(profile, job, input);

  await consumeUsage(user.id, "COVER_LETTER", user.isDemo);
  let refunded = false;
  const refund = async () => {
    if (refunded) return;
    refunded = true;
    await refundUsage(user.id, "COVER_LETTER").catch((e: unknown) =>
      console.error("[letters] refund failed", describeError(e)),
    );
  };

  let result: Awaited<ReturnType<typeof streamAiText>>;
  try {
    result = await streamAiText({
      purpose: "letters.generate",
      userId: user.id,
      model: "strong",
      system,
      prompt,
      mockKey: "letters.generate",
    });
  } catch (e) {
    await refund();
    throw e;
  }

  const id = randomUUID();
  const encoder = new TextEncoder();
  const reader = result.fullStream.getReader();
  let text = "";

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.type === "error") throw value.error;
          if (value.type === "text-delta") {
            text += value.text;
            controller.enqueue(encoder.encode(value.text));
            return;
          }
        }
        const content = text.trim().slice(0, MAX_LETTER_CHARS);
        if (!content) throw new Error("The model returned an empty letter.");
        await db.coverLetter.create({
          data: {
            id,
            userId: user.id,
            cvId: cv.id,
            jobId: job.id,
            tone: input.tone,
            language: input.language,
            length: input.length,
            content,
          },
        });
        controller.close();
      } catch (e) {
        console.error("[letters] generation failed", describeError(e));
        await refund();
        controller.error(e);
      }
    },
    async cancel() {
      await refund();
      await reader.cancel().catch(() => {});
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      [LETTER_ID_HEADER]: id,
    },
  });
}
