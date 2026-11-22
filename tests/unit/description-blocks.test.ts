import { describe, expect, it } from "vitest";
import { toDescriptionBlocks } from "@/components/jobs/description-blocks";

describe("toDescriptionBlocks", () => {
  it("splits paragraphs and bullet lists", () => {
    expect(
      toDescriptionBlocks("About us\nline two\n\nWhat you get:\n• Remote\n• Equity\n\n• A\n• B"),
    ).toEqual([
      { kind: "paragraph", text: "About us\nline two" },
      { kind: "paragraph", text: "What you get:" },
      { kind: "list", items: ["Remote", "Equity"] },
      { kind: "list", items: ["A", "B"] },
    ]);
  });

  it("keeps a block with bullets in the middle as one paragraph", () => {
    expect(toDescriptionBlocks("• a\nplain\n• b")).toEqual([
      { kind: "paragraph", text: "• a\nplain\n• b" },
    ]);
  });

  it("treats a single run-on paragraph as one paragraph", () => {
    expect(toDescriptionBlocks("Just one long line")).toEqual([
      { kind: "paragraph", text: "Just one long line" },
    ]);
  });

  it("returns nothing for an empty description", () => {
    expect(toDescriptionBlocks("  \n\n ")).toEqual([]);
  });
});
