import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { MOCK_FIXTURES } from "@/server/ai/mock";
import { deleteLetter, getLetter, listLetters, updateLetter } from "@/server/letters/crud";

const session = vi.hoisted(() => ({ user: null as null | { id: string; isDemo: boolean } }));
vi.mock("@/server/auth/session", () => ({
  getUserFromHeaders: async () => session.user,
}));

const streamControl = vi.hoisted(() => ({
  mode: "real" as "real" | "error" | "empty" | "silent" | "truncated",
}));
vi.mock("@/server/ai/stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/ai/stream")>();
  return {
    ...actual,
    streamAiText: async (...args: Parameters<typeof actual.streamAiText>) => {
      if (streamControl.mode === "real") return actual.streamAiText(...args);
      if (streamControl.mode === "silent") {
        // A model that has not produced any text yet.
        const fullStream = new ReadableStream({ pull: () => new Promise<void>(() => {}) });
        return { fullStream } as unknown as Awaited<ReturnType<typeof actual.streamAiText>>;
      }
      const fullStream = new ReadableStream({
        start(c) {
          if (streamControl.mode === "truncated") {
            c.enqueue({ type: "text-delta", id: "t", text: "Dear Hiring Manager, I am" });
            c.enqueue({ type: "finish", finishReason: "length", rawFinishReason: "MAX_TOKENS" });
          }
          if (streamControl.mode === "error") {
            c.enqueue({ type: "text-delta", id: "t", text: "Dear" });
            c.enqueue({ type: "error", error: new Error("provider exploded") });
          }
          c.close();
        },
      });
      return { fullStream } as unknown as Awaited<ReturnType<typeof actual.streamAiText>>;
    },
  };
});

import { POST } from "@/app/api/letters/stream/route";

const A = "letter-user-a";
const B = "letter-user-b";
const DAY = 86_400_000;
const FIXTURE = MOCK_FIXTURES["letters.generate"] as string;

async function makeCv(userId: string, status: "ANALYZED" | "UPLOADED" = "ANALYZED") {
  const profile = (MOCK_FIXTURES["cv.analysis"] as { profile: unknown }).profile;
  return db.cv.create({
    data: {
      userId,
      fileName: "cv.pdf",
      blobKey: `cv/${userId}/k`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      rawText: "text",
      isActive: true,
      status,
      ...(status === "ANALYZED" ? { profile: profile as object } : {}),
    },
  });
}

async function makeJob(over: { ownerId?: string; title?: string } = {}) {
  return db.job.create({
    data: {
      source: over.ownerId ? "MANUAL" : "ARBEITNOW",
      dedupeHash: `h-${over.title ?? "job"}-${over.ownerId ?? "pub"}`,
      title: over.title ?? "Frontend Engineer",
      company: "Lisbon Labs",
      description: "Build the web app with React.",
      ownerId: over.ownerId ?? null,
      expiresAt: new Date(Date.now() + 30 * DAY),
    },
  });
}

function request(jobId: string, over: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/letters/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, tone: "NEUTRAL", language: "en", length: "MEDIUM", ...over }),
  });
}

const usageCount = async (userId = A) =>
  (await db.usageCounter.findFirst({ where: { userId, action: "COVER_LETTER" } }))?.count ?? 0;

beforeEach(async () => {
  for (const id of [A, B]) {
    await db.user.create({ data: { id, name: id, email: `${id}@example.com` } });
  }
  session.user = { id: A, isDemo: false };
});

describe("POST /api/letters/stream", () => {
  it("streams the letter, saves it with the mock content and consumes one usage", async () => {
    const cv = await makeCv(A);
    const job = await makeJob();
    const res = await POST(request(job.id, { tone: "FORMAL", language: "pt", length: "LONG" }));

    expect(res.status).toBe(200);
    const id = res.headers.get("X-Letter-Id");
    expect(id).toBeTruthy();
    expect(await res.text()).toBe(FIXTURE);

    const saved = await db.coverLetter.findUniqueOrThrow({ where: { id: id! } });
    expect(saved).toMatchObject({
      userId: A,
      cvId: cv.id,
      jobId: job.id,
      tone: "FORMAL",
      language: "pt",
      length: "LONG",
      content: FIXTURE,
    });
    expect(await usageCount()).toBe(1);
  });

  it("refunds the usage and saves nothing when the stream errors", async () => {
    await makeCv(A);
    const job = await makeJob();
    streamControl.mode = "error";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await POST(request(job.id));
      await expect(res.text()).rejects.toThrow();
    } finally {
      streamControl.mode = "real";
      spy.mockRestore();
    }
    expect(await db.coverLetter.count()).toBe(0);
    expect(await usageCount()).toBe(0);
  });

  it("refunds the usage and saves nothing when the model returns an empty letter", async () => {
    await makeCv(A);
    const job = await makeJob();
    streamControl.mode = "empty";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await POST(request(job.id));
      await expect(res.text()).rejects.toThrow();
    } finally {
      streamControl.mode = "real";
      spy.mockRestore();
    }
    expect(await db.coverLetter.count()).toBe(0);
    expect(await usageCount()).toBe(0);
  });

  it("refunds the usage and saves nothing when the model's output was truncated (finishReason length)", async () => {
    await makeCv(A);
    const job = await makeJob();
    streamControl.mode = "truncated";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await POST(request(job.id));
      await expect(res.text()).rejects.toThrow();
    } finally {
      streamControl.mode = "real";
      spy.mockRestore();
    }
    expect(await db.coverLetter.count()).toBe(0);
    expect(await usageCount()).toBe(0);
  });

  it("refunds the usage when saving the letter fails", async () => {
    await makeCv(A);
    const job = await makeJob();
    const create = vi
      .spyOn(db.coverLetter, "create")
      .mockRejectedValueOnce(new Error("db down") as never);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await POST(request(job.id));
      await expect(res.text()).rejects.toThrow();
    } finally {
      create.mockRestore();
      spy.mockRestore();
    }
    expect(await db.coverLetter.count()).toBe(0);
    expect(await usageCount()).toBe(0);
  });

  it("keeps the usage spent, saves no letter and records an estimated cost when the client aborts mid-stream", async () => {
    await makeCv(A);
    const job = await makeJob();
    const res = await POST(request(job.id));
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 300));

    expect(await db.coverLetter.count()).toBe(0);
    expect(await usageCount()).toBe(1);
    const calls = await db.aiCall.findMany({ where: { purpose: "letters.generate" } });
    expect(calls).toHaveLength(1);
    expect(calls[0].ok).toBe(false);
    expect(calls[0].inputTokens).toBeGreaterThan(0);
    expect(calls[0].outputTokens).toBeGreaterThan(0);
    expect(Number(calls[0].costUsd)).toBeGreaterThan(0);
  });

  it("refunds the usage when the client aborts before the first chunk", async () => {
    await makeCv(A);
    const job = await makeJob();
    streamControl.mode = "silent";
    try {
      const res = await POST(request(job.id));
      expect(await usageCount()).toBe(1);
      await res.body!.cancel();
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      streamControl.mode = "real";
    }
    expect(await db.coverLetter.count()).toBe(0);
    expect(await usageCount()).toBe(0);
  });

  it("returns 401 without a session", async () => {
    session.user = null;
    const res = await POST(request("x"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid body", async () => {
    const res = await POST(request("x", { tone: "ANGRY" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 CV_NOT_READY without an analysed CV and consumes nothing", async () => {
    const job = await makeJob();
    let res = await POST(request(job.id));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CV_NOT_READY");

    await makeCv(A, "UPLOADED");
    res = await POST(request(job.id));
    expect(res.status).toBe(409);
    expect(await usageCount()).toBe(0);
  });

  it("returns 429 with the limit once the daily limit is reached", async () => {
    await makeCv(A);
    const job = await makeJob();
    await db.usageCounter.create({
      data: {
        userId: A,
        action: "COVER_LETTER",
        day: new Date(new Date().toISOString().slice(0, 10)),
        count: 10,
      },
    });
    const res = await POST(request(job.id));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: "LIMIT_EXCEEDED", limit: 10 } });
    expect(await db.coverLetter.count()).toBe(0);
  });

  it("returns 404 for another user's manual job", async () => {
    await makeCv(A);
    const job = await makeJob({ ownerId: B });
    const res = await POST(request(job.id));
    expect(res.status).toBe(404);
    expect(await usageCount()).toBe(0);
  });

  it("returns 503 and refunds when the global budget is exhausted", async () => {
    await makeCv(A);
    const job = await makeJob();
    await db.aiCall.create({
      data: {
        purpose: "x",
        model: "strong",
        inputTokens: 1,
        outputTokens: 1,
        durationMs: 1,
        ok: true,
        costUsd: 100,
      },
    });
    const res = await POST(request(job.id));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("BUDGET_EXHAUSTED");
    expect(await usageCount()).toBe(0);
  });
});

describe("letter crud", () => {
  async function seedLetter(userId: string) {
    const cv = await makeCv(userId);
    const job = await makeJob({ ownerId: userId, title: `Job of ${userId}` });
    return db.coverLetter.create({
      data: {
        userId,
        cvId: cv.id,
        jobId: job.id,
        tone: "NEUTRAL",
        language: "en",
        length: "SHORT",
        content: "Hello",
      },
    });
  }

  it("lists a user's letters with job title and company", async () => {
    await seedLetter(A);
    await seedLetter(B);
    const letters = await listLetters(A);
    expect(letters).toHaveLength(1);
    expect(letters[0].job).toMatchObject({ title: `Job of ${A}`, company: "Lisbon Labs" });
  });

  it("hides another user's letter from get, update and delete", async () => {
    const letter = await seedLetter(B);
    await expect(getLetter(A, letter.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateLetter(A, letter.id, "hacked")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteLetter(A, letter.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.coverLetter.findUniqueOrThrow({ where: { id: letter.id } })).content).toBe(
      "Hello",
    );
  });

  it("updates and deletes the owner's letter", async () => {
    const letter = await seedLetter(A);
    await updateLetter(A, letter.id, "Edited");
    expect((await getLetter(A, letter.id)).content).toBe("Edited");
    await deleteLetter(A, letter.id);
    await expect(getLetter(A, letter.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects content over 10000 characters with INVALID_INPUT", async () => {
    const letter = await seedLetter(A);
    await updateLetter(A, letter.id, "x".repeat(10_000));
    const err = await updateLetter(A, letter.id, "x".repeat(10_001)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("INVALID_INPUT");
  });
});
