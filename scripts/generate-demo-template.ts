/**
 * Regenerates src/server/demo/template-data.json, the pre-filled content of every demo account.
 *
 *   npx tsx scripts/generate-demo-template.ts
 *
 * Run it by hand with real keys (AI_PROVIDER=anthropic, EMBEDDINGS_PROVIDER=voyage in
 * .env.local) to replace the committed mock output with real AI output. With the fakes it
 * reproduces the committed file. It reads tests/fixtures/cv/sample.pdf, analyses it, takes the
 * ten best-matching jobs (the best three are saved) (from the database when it has embedded jobs, else from the seed
 * set), scores them with the re-rank prompt, writes one cover letter for the best one, and writes the JSON. It writes nothing to the
 * database and uses no daily limits.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const ROOT = process.cwd();
// One re-rank batch (the live batch size): the demo CV starts with scores for its 10 best jobs, so
// the first match request needs no AI call. The best 3 of them are the saved jobs.
const MATCH_COUNT = 10;
const SAVED_COUNT = 3;
const noDb = { record: async () => {}, assertBudget: async () => {} };

type Candidate = { dedupeHash: string; title: string; company: string; description: string };

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

async function topFromDb(vector: number[], limit: number): Promise<Candidate[]> {
  try {
    const { db } = await import("../src/lib/db");
    const { toPgVector } = await import("../src/server/embeddings/vector");
    try {
      return await db.$queryRaw<Candidate[]>`
        SELECT "dedupeHash", "title", "company", "description" FROM "Job"
        WHERE "embedding" IS NOT NULL AND "expiresAt" > now() AND "ownerId" IS NULL
        ORDER BY "embedding" <=> ${toPgVector(vector)}::vector LIMIT ${limit}`;
    } finally {
      await db.$disconnect();
    }
  } catch (err) {
    console.warn(`Database unavailable (${err instanceof Error ? err.message : err}).`);
    return [];
  }
}

async function topFromSeed(vector: number[], limit: number): Promise<Candidate[]> {
  const { buildSeedJobs } = await import("../src/server/demo/seed-jobs");
  const { getEmbedder } = await import("../src/server/embeddings/embedder");
  const { embeddingText } = await import("../src/server/jobs/ingest");
  const jobs = await buildSeedJobs();
  const vectors = await getEmbedder().embed(jobs.map(embeddingText), "document");
  return jobs
    .map((job, i) => ({ job, sim: dot(vector, vectors[i]) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, limit)
    .map(({ job }) => job);
}

async function main() {
  const { extractText, PDF_MIME } = await import("../src/server/cv/parse");
  const { cvAnalysisPrompt, cvAnalysisSystem } = await import("../src/server/cv/prompts");
  const { CvAnalysisResult, profileToText } = await import("../src/server/cv/schemas");
  const { generateStructured } = await import("../src/server/ai/structured");
  const { streamAiText } = await import("../src/server/ai/stream");
  const { MAX_OUTPUT_TOKENS } = await import("../src/server/ai/models");
  const { getEmbedder } = await import("../src/server/embeddings/embedder");
  const { buildLetterPrompt } = await import("../src/server/letters/prompts");
  const { rerankPrompt, rerankSystem } = await import("../src/server/matching/prompts");
  const { RerankResult } = await import("../src/server/matching/schemas");
  const { DemoTemplate } = await import("../src/server/demo/template-schema");

  const file = readFileSync(path.join(ROOT, "tests/fixtures/cv/sample.pdf"));
  const rawText = await extractText(file, PDF_MIME);

  const { profile, analysis } = await generateStructured(
    {
      purpose: "demo.template.cv",
      model: "fast",
      schema: CvAnalysisResult,
      system: cvAnalysisSystem("en"),
      prompt: cvAnalysisPrompt(rawText),
      mockKey: "cv.analysis",
      maxOutputTokens: MAX_OUTPUT_TOKENS.cvAnalysis,
    },
    noDb,
  );

  const [vector] = await getEmbedder().embed([profileToText(profile)], "query");
  let top = await topFromDb(vector, MATCH_COUNT);
  if (top.length < MATCH_COUNT) top = await topFromSeed(vector, MATCH_COUNT);

  // Same prompt and schema as the live re-rank; the dedupe hash stands in for the job id.
  const rerank = await generateStructured(
    {
      purpose: "demo.template.matches",
      model: "fast",
      schema: RerankResult,
      system: rerankSystem(),
      prompt: rerankPrompt(
        profileToText(profile),
        top.map((j) => ({ ...j, id: j.dedupeHash })),
      ),
      mockKey: "matching.rerank",
      maxOutputTokens: MAX_OUTPUT_TOKENS.rerank,
    },
    noDb,
  );
  const matches = top.map((j) => {
    const r = rerank.results.find((x) => x.jobId === j.dedupeHash);
    if (!r) throw new Error(`The re-rank returned no result for ${j.title}`);
    return {
      jobDedupeHash: j.dedupeHash,
      score: r.score,
      matchedSkills: r.matchedSkills,
      gaps: r.gaps,
      explanation: r.explanation,
    };
  });

  const options = { tone: "NEUTRAL", language: "en", length: "MEDIUM" } as const;
  const { system, prompt } = buildLetterPrompt(profile, top[0], options);
  const stream = await streamAiText(
    {
      purpose: "demo.template.letter",
      model: "strong",
      system,
      prompt,
      mockKey: "letters.generate",
      maxOutputTokens: MAX_OUTPUT_TOKENS.letter,
    },
    noDb,
  );
  const content = (await stream.text).trim();

  const template = DemoTemplate.parse({
    cv: { fileName: "sample.pdf", rawText, profile, analysis, blob: file.toString("base64") },
    savedJobDedupeHashes: top.slice(0, SAVED_COUNT).map((j) => j.dedupeHash),
    matches,
    letter: { jobDedupeHash: top[0].dedupeHash, ...options, content },
  });
  const out = path.join(ROOT, "src/server/demo/template-data.json");
  writeFileSync(out, `${JSON.stringify(template, null, 2)}\n`);
  console.log(
    `Wrote ${out}. Saved jobs: ${top
      .slice(0, SAVED_COUNT)
      .map((j) => `${j.title} (${j.company})`)
      .join("; ")}`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
