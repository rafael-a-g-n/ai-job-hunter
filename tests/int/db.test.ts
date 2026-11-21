import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

function vec(first: number): string {
  const v = new Array<number>(1024).fill(0);
  v[0] = first;
  v[1] = 1;
  return `[${v.join(",")}]`;
}

describe("database", () => {
  it("cascades Cv deletion when the user is deleted", async () => {
    const user = await db.user.create({
      data: { id: "u1", name: "Ada", email: "ada@example.com" },
    });
    const cv = await db.cv.create({
      data: {
        userId: user.id,
        fileName: "cv.pdf",
        blobKey: "k",
        mimeType: "application/pdf",
        sizeBytes: 10,
      },
    });
    await db.user.delete({ where: { id: user.id } });
    expect(await db.cv.findUnique({ where: { id: cv.id } })).toBeNull();
  });

  it("stores and queries pgvector embeddings by cosine distance", async () => {
    const mk = (id: string) =>
      db.job.create({
        data: {
          id,
          source: "MANUAL",
          dedupeHash: id,
          title: id,
          company: "Acme",
          description: "d",
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    await mk("near");
    await mk("far");
    await db.$executeRaw`UPDATE "Job" SET embedding = ${vec(0)}::vector WHERE id = 'near'`;
    await db.$executeRaw`UPDATE "Job" SET embedding = ${vec(50)}::vector WHERE id = 'far'`;

    const rows = await db.$queryRaw<{ id: string; distance: number }[]>`
      SELECT id, embedding <=> ${vec(0)}::vector AS distance
      FROM "Job" WHERE embedding IS NOT NULL ORDER BY distance ASC`;

    expect(rows.map((r) => r.id)).toEqual(["near", "far"]);
    expect(rows[0].distance).toBeCloseTo(0, 5);
    expect(rows[1].distance).toBeGreaterThan(0);
  });
});
