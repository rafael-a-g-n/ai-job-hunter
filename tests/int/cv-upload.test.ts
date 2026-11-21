import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { deleteCv } from "@/server/cv/delete";
import { DOCX_MIME, PDF_MIME } from "@/server/cv/parse";
import { uploadCv, UNREADABLE_CV_MESSAGE } from "@/server/cv/upload";
import { getBlobStore } from "@/server/storage/blob-store";

const UID = "cv-user";
const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures/cv", name));
const file = (name: string, type: string) => {
  const data = fixture(name);
  return { name, type, size: data.length, data };
};

beforeEach(async () => {
  await db.user.create({ data: { id: UID, name: "Cv", email: "cv@example.com" } });
});

describe("uploadCv", () => {
  it("stores a valid PDF, extracts text and marks it active", async () => {
    const cv = await uploadCv(UID, file("sample.pdf", PDF_MIME));
    expect(cv).toMatchObject({
      userId: UID,
      status: "UPLOADED",
      isActive: true,
      failureReason: null,
    });
    expect(cv.rawText).toContain("Ana Silva");
    expect(cv.blobKey).toMatch(new RegExp(`^cv/${UID}/.+`));
    const stored = await getBlobStore().get(cv.blobKey);
    expect(stored.equals(fixture("sample.pdf"))).toBe(true);
  });

  it("accepts a DOCX", async () => {
    const cv = await uploadCv(UID, file("sample.docx", DOCX_MIME));
    expect(cv.status).toBe("UPLOADED");
  });

  it("rejects a file over 4 MB", async () => {
    const data = Buffer.alloc(4 * 1024 * 1024 + 1);
    await expect(
      uploadCv(UID, { name: "big.pdf", type: PDF_MIME, size: data.length, data }),
    ).rejects.toMatchObject({
      code: "INVALID_FILE",
      userMessage: "The file is too large. The maximum size is 4 MB.",
    });
    expect(await db.cv.count()).toBe(0);
  });

  it("rejects a wrong type", async () => {
    const data = Buffer.from("png");
    const p = uploadCv(UID, { name: "a.png", type: "image/png", size: data.length, data });
    await expect(p).rejects.toBeInstanceOf(AppError);
    await expect(p).rejects.toMatchObject({ code: "INVALID_FILE" });
  });

  it("marks an image-only PDF as FAILED with the exact reason", async () => {
    const cv = await uploadCv(UID, file("scanned.pdf", PDF_MIME));
    expect(cv.status).toBe("FAILED");
    expect(cv.failureReason).toBe(UNREADABLE_CV_MESSAGE);
    expect(cv.failureReason).toBe(
      "We couldn't read text from this file. Try a text-based PDF or DOCX.",
    );
  });

  it("marks an empty DOCX as FAILED", async () => {
    const cv = await uploadCv(UID, file("empty.docx", DOCX_MIME));
    expect(cv.status).toBe("FAILED");
  });

  it("marks a corrupt PDF as FAILED instead of throwing", async () => {
    const data = Buffer.from("not really a pdf");
    const cv = await uploadCv(UID, { name: "x.pdf", type: PDF_MIME, size: data.length, data });
    expect(cv.status).toBe("FAILED");
  });

  it("makes a second upload active and the first inactive", async () => {
    const first = await uploadCv(UID, file("sample.pdf", PDF_MIME));
    const second = await uploadCv(UID, file("sample.docx", DOCX_MIME));
    expect((await db.cv.findUniqueOrThrow({ where: { id: first.id } })).isActive).toBe(false);
    expect((await db.cv.findUniqueOrThrow({ where: { id: second.id } })).isActive).toBe(true);
  });

  it("keeps the previous CV active when a new upload fails", async () => {
    const first = await uploadCv(UID, file("sample.pdf", PDF_MIME));
    const failed = await uploadCv(UID, file("scanned.pdf", PDF_MIME));
    expect(failed.status).toBe("FAILED");
    expect(failed.isActive).toBe(false);
    expect((await db.cv.findUniqueOrThrow({ where: { id: first.id } })).isActive).toBe(true);
  });

  it("makes a failed first upload active", async () => {
    const failed = await uploadCv(UID, file("scanned.pdf", PDF_MIME));
    expect(failed.isActive).toBe(true);
  });

  it("keeps an ANALYZED CV active when a new readable CV is uploaded", async () => {
    const first = await uploadCv(UID, file("sample.pdf", PDF_MIME));
    await db.cv.update({ where: { id: first.id }, data: { status: "ANALYZED" } });
    const second = await uploadCv(UID, file("sample.docx", DOCX_MIME));
    expect(second.isActive).toBe(false);
    expect((await db.cv.findUniqueOrThrow({ where: { id: first.id } })).isActive).toBe(true);
  });

  it("does not deactivate another user's CV", async () => {
    await db.user.create({ data: { id: "other", name: "O", email: "o@example.com" } });
    const theirs = await uploadCv("other", file("sample.pdf", PDF_MIME));
    await uploadCv(UID, file("sample.pdf", PDF_MIME));
    expect((await db.cv.findUniqueOrThrow({ where: { id: theirs.id } })).isActive).toBe(true);
  });
});

const blobExists = (key: string) =>
  getBlobStore()
    .get(key)
    .then(
      () => true,
      (e: unknown) => {
        if (e instanceof NotFoundError) return false;
        throw e;
      },
    );

describe("CV limits and storage", () => {
  it("does not store the file of an unreadable CV", async () => {
    const cv = await uploadCv(UID, file("scanned.pdf", PDF_MIME));
    expect(cv.status).toBe("FAILED");
    expect(await blobExists(cv.blobKey)).toBe(false);
  });

  it("rejects the 6th CV with CV_LIMIT and stores nothing", async () => {
    for (let i = 0; i < 5; i++) await uploadCv(UID, file("sample.pdf", PDF_MIME));
    const err = await uploadCv(UID, file("sample.pdf", PDF_MIME)).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: "CV_LIMIT",
      userMessage: "You can keep up to 5 CVs. Delete one first.",
    });
    expect(await db.cv.count({ where: { userId: UID } })).toBe(5);
  });

  it("never passes the cap with parallel uploads", async () => {
    for (let i = 0; i < 3; i++) await uploadCv(UID, file("sample.pdf", PDF_MIME));
    const results = await Promise.allSettled(
      [1, 2, 3, 4].map(() => uploadCv(UID, file("sample.pdf", PDF_MIME))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await db.cv.count({ where: { userId: UID } })).toBe(5);
  });
});

describe("deleteCv", () => {
  it("deletes the CV and its file", async () => {
    const cv = await uploadCv(UID, file("sample.pdf", PDF_MIME));
    await deleteCv(UID, cv.id);
    expect(await db.cv.count()).toBe(0);
    expect(await blobExists(cv.blobKey)).toBe(false);
  });

  it("activates the most recent ANALYZED CV when the active one is deleted", async () => {
    const older = await uploadCv(UID, file("sample.pdf", PDF_MIME));
    const newer = await uploadCv(UID, file("sample.docx", DOCX_MIME));
    const pending = await uploadCv(UID, file("sample.pdf", PDF_MIME));
    await db.cv.updateMany({
      where: { id: { in: [older.id, newer.id] } },
      data: { status: "ANALYZED" },
    });
    await db.cv.updateMany({ data: { isActive: false } });
    await db.cv.update({ where: { id: pending.id }, data: { isActive: true } });

    await deleteCv(UID, pending.id);
    const active = await db.cv.findMany({ where: { userId: UID, isActive: true } });
    expect(active.map((c) => c.id)).toEqual([newer.id]);
  });

  it("gives another user's CV a NotFoundError and keeps it", async () => {
    await db.user.create({ data: { id: "other", name: "O", email: "o@example.com" } });
    const theirs = await uploadCv("other", file("sample.pdf", PDF_MIME));
    await expect(deleteCv(UID, theirs.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.cv.count()).toBe(1);
    expect(await blobExists(theirs.blobKey)).toBe(true);
  });
});
