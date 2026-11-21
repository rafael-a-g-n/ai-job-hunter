import { describe, expect, it } from "vitest";
import { cvAnalysisPrompt, MAX_CV_PROMPT_CHARS } from "@/server/cv/prompts";

describe("cvAnalysisPrompt", () => {
  it("sends a short CV whole", () => {
    expect(cvAnalysisPrompt("Ana Silva, Frontend Developer")).toContain(
      "<cv>\nAna Silva, Frontend Developer\n</cv>",
    );
  });

  it("caps the CV text at 40,000 characters", () => {
    expect(MAX_CV_PROMPT_CHARS).toBe(40_000);
    const prompt = cvAnalysisPrompt("a".repeat(39_999) + "bc" + "z".repeat(10_000));
    expect(prompt).toContain("a".repeat(39_999) + "b\n</cv>");
    expect(prompt).not.toContain("z");
  });
});
