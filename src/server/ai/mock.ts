import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";

/** Add a key here (and its fixture below) when a later task needs a mocked AI call. */
export type MockKey = "test.echo" | "cv.analysis";

/** Deterministic outputs used when AI_PROVIDER=mock. Strings stream as-is, objects as JSON. */
export const MOCK_FIXTURES: Record<MockKey, unknown> = {
  "test.echo": { message: "hello from the mock" },
  "cv.analysis": {
    profile: {
      fullName: "Ana Silva",
      headline: "Frontend Developer",
      seniority: "mid",
      yearsExperience: 4,
      location: "Lisbon, Portugal",
      languages: [
        { name: "Portuguese", level: "Native" },
        { name: "English", level: "Fluent" },
      ],
      skills: [
        { name: "React", category: "technical", level: 4 },
        { name: "TypeScript", category: "technical", level: 4 },
        { name: "CSS", category: "technical", level: 3 },
        { name: "Git", category: "tool", level: 4 },
        { name: "Teamwork", category: "soft", level: 4 },
      ],
      experience: [
        {
          title: "Frontend Developer",
          company: "Acme Digital",
          start: "2022-03",
          end: null,
          highlights: [
            "Built a React and TypeScript design system used by 5 product teams",
            "Cut page load time by 35% through code splitting",
          ],
        },
        {
          title: "Junior Web Developer",
          company: "Studio Tejo",
          start: "2020-09",
          end: "2022-02",
          highlights: ["Delivered responsive marketing sites for 12 clients"],
        },
      ],
      education: [
        { degree: "BSc Computer Science", institution: "University of Lisbon", year: "2020" },
      ],
      preferences: { remote: true, roles: ["Frontend Developer", "Frontend Engineer"] },
    },
    analysis: {
      overallScore: 78,
      sections: {
        clarity: { score: 82, comment: "Well structured and easy to scan." },
        impact: { score: 70, comment: "Some measurable results; add more numbers." },
        atsCompatibility: { score: 85, comment: "Plain layout with clear section headings." },
        skills: { score: 76, comment: "Strong core stack; group skills by category." },
      },
      strengths: ["Clear modern frontend stack", "Quantified achievements in the current role"],
      improvements: [
        {
          title: "Quantify more achievements",
          detail: "Add metrics to the earlier role so impact is visible across your career.",
          example:
            "Delivered responsive marketing sites for 12 clients, cutting average delivery time by 20%.",
        },
        {
          title: "Add a short summary",
          detail: "Open with two lines stating your focus and strongest skills.",
          example: null,
        },
      ],
    },
  },
};

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};

export function mockModel(mockKey: MockKey): LanguageModelV4 {
  if (!Object.hasOwn(MOCK_FIXTURES, mockKey)) {
    throw new Error(`No mock fixture for "${mockKey}". Add it to MOCK_FIXTURES.`);
  }
  const fixture = MOCK_FIXTURES[mockKey];
  const text = typeof fixture === "string" ? fixture : JSON.stringify(fixture);
  const finishReason = { unified: "stop", raw: "stop" } as const;

  return new MockLanguageModelV4({
    provider: "mock",
    modelId: `mock:${mockKey}`,
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason,
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: text },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason, usage },
        ],
      }),
    }),
  });
}
