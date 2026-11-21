import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";

/** Add a key here (and its fixture below) when a later task needs a mocked AI call. */
export type MockKey =
  "test.echo" | "cv.analysis" | "jobs.normalize" | "matching.rerank" | "letters.generate";

/** Deterministic outputs used when AI_PROVIDER=mock. Strings stream as-is, objects as JSON. */
export const MOCK_FIXTURES: Record<MockKey, unknown> = {
  "test.echo": { message: "hello from the mock" },
  "letters.generate": [
    "Dear Hiring Manager,",
    "I am writing to apply for the role at your company. I am a Frontend Developer based in Lisbon with four years of experience building web applications with React and TypeScript, and your posting matches the work I enjoy most.",
    "At Acme Digital, I built a React and TypeScript design system now used by 5 product teams, and I cut page load time by 35% through code splitting. Earlier, at Studio Tejo, I delivered responsive marketing sites for 12 clients, which taught me to ship carefully and communicate clearly with people outside engineering.",
    "I hold a BSc in Computer Science from the University of Lisbon, and I work comfortably in Portuguese and English. I care about clean interfaces, good tooling with Git, and steady teamwork, and I would bring that approach to your team.",
    "Thank you for your time and consideration. I would be glad to discuss how my experience could help your team.",
    "Kind regards,\nAna Silva",
  ].join("\n\n"),
  "jobs.normalize": {
    title: "Frontend Engineer",
    company: "Lisbon Labs",
    location: "Lisbon, Portugal",
    remote: true,
    description:
      "We are looking for a Frontend Engineer to build our customer-facing web app with React and TypeScript. You will work with design and product, write tests and improve performance. Hybrid or fully remote within Europe.",
  },
  // A template: the mock expands it into one entry per `<job id="...">` found in the prompt
  // (see expandRerank), because real job ids are only known at run time.
  "matching.rerank": {
    results: [
      {
        jobId: "<job id>",
        score: 88,
        matchedSkills: ["React", "TypeScript"],
        gaps: ["GraphQL"],
        explanation:
          "Strong overlap with the required frontend stack; GraphQL experience is missing.",
      },
    ],
  },
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

const RERANK_STEP = 6;
const RERANK_FLOOR = 30;

/** One result per job id in the prompt, scores falling by RERANK_STEP in prompt order. */
function expandRerank(template: unknown, promptText: string): unknown {
  const entry = (template as { results: Record<string, unknown>[] }).results[0];
  const ids = [...promptText.matchAll(/<job id="([^"]+)">/g)].map((m) => m[1]);
  return {
    results: ids.map((jobId, i) => ({
      ...entry,
      jobId,
      score: Math.max(RERANK_FLOOR, (entry.score as number) - i * RERANK_STEP),
    })),
  };
}

function promptToText(prompt: unknown): string {
  if (!Array.isArray(prompt)) return "";
  return prompt
    .flatMap((m: { content?: unknown }) => (Array.isArray(m.content) ? m.content : []))
    .map((part: { type?: string; text?: string }) =>
      part.type === "text" ? (part.text ?? "") : "",
    )
    .join("\n");
}

export function mockModel(mockKey: MockKey): LanguageModelV4 {
  if (!Object.hasOwn(MOCK_FIXTURES, mockKey)) {
    throw new Error(`No mock fixture for "${mockKey}". Add it to MOCK_FIXTURES.`);
  }
  const fixture = MOCK_FIXTURES[mockKey];
  const render = (promptText: string): string => {
    const value = mockKey === "matching.rerank" ? expandRerank(fixture, promptText) : fixture;
    return typeof value === "string" ? value : JSON.stringify(value);
  };
  const finishReason = { unified: "stop", raw: "stop" } as const;

  return new MockLanguageModelV4({
    provider: "mock",
    modelId: `mock:${mockKey}`,
    doGenerate: async (options) => ({
      content: [{ type: "text", text: render(promptToText(options.prompt)) }],
      finishReason,
      usage,
      warnings: [],
    }),
    doStream: async (options) => {
      const text = render(promptToText(options.prompt));
      // Plain-text fixtures stream in small pieces so the UI can show live output.
      const plain = typeof fixture === "string";
      const pieces = plain ? (text.match(/[\s\S]{1,40}/g) ?? []) : [text];
      return {
        stream: simulateReadableStream({
          chunkDelayInMs: plain ? 15 : 0,
          chunks: [
            { type: "text-start", id: "t" },
            ...pieces.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
            { type: "text-end", id: "t" },
            { type: "finish", finishReason, usage },
          ],
        }),
      };
    },
  });
}
