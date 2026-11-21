import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOCX_MIME, extractText, PDF_MIME } from "@/server/cv/parse";

const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures/cv", name));

describe("extractText", () => {
  it("reads a text-based PDF", async () => {
    const text = await extractText(fixture("sample.pdf"), PDF_MIME);
    expect(text).toContain("Ana Silva");
    expect(text).toContain("TypeScript");
    expect(text.length).toBeGreaterThanOrEqual(200);
  });

  it("reads a DOCX", async () => {
    const text = await extractText(fixture("sample.docx"), DOCX_MIME);
    expect(text).toContain("Ana Silva");
    expect(text).toContain("TypeScript");
    expect(text.length).toBeGreaterThanOrEqual(200);
  });

  it("returns almost nothing for an image-only PDF", async () => {
    expect((await extractText(fixture("scanned.pdf"), PDF_MIME)).length).toBeLessThan(200);
  });

  it("returns an empty string for an empty DOCX", async () => {
    expect(await extractText(fixture("empty.docx"), DOCX_MIME)).toBe("");
  });

  it("normalises whitespace", async () => {
    const text = await extractText(fixture("sample.docx"), DOCX_MIME);
    expect(text).not.toMatch(/ {2,}|\n{3,}/);
    expect(text).toBe(text.trim());
  });

  it("rejects unsupported types", async () => {
    await expect(extractText(Buffer.from("x"), "image/png")).rejects.toThrow();
  });
});
