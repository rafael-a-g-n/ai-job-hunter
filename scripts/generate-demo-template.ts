/**
 * Regenerates src/server/demo/template-data.json, the pre-filled content of every demo account.
 *
 *   npx tsx scripts/generate-demo-template.ts
 *
 * Run it by hand with real keys (AI_PROVIDER=anthropic, EMBEDDINGS_PROVIDER=voyage in
 * .env.local) to replace the committed mock output with real AI output. With the fakes it
 * reproduces the committed file. It reads tests/fixtures/cv/sample.pdf, analyses it, takes the
 * three best-matching jobs (from the database when it has embedded jobs, else from the seed
 * set), writes one cover letter for the best one, and writes the JSON. It writes nothing to the
 * database and uses no daily limits.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const ROOT = process.cwd();
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
  const { getEmbedder } = await import("../src/server/embeddings/embedder");
  const { buildLetterPrompt } = await import("../src/server/letters/prompts");
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
    },
    noDb,
  );

  const [vector] = await getEmbedder().embed([profileToText(profile)], "query");
  let top = await topFromDb(vector, 3);
  if (top.length < 3) top = await topFromSeed(vector, 3);

  const options = { tone: "NEUTRAL", language: "en", length: "MEDIUM" } as const;
  const { system, prompt } = buildLetterPrompt(profile, top[0], options);
  const stream = await streamAiText(
    {
      purpose: "demo.template.letter",
      model: "strong",
      system,
      prompt,
      mockKey: "letters.generate",
    },
    noDb,
  );
  const content = (await stream.text).trim();

  const template = DemoTemplate.parse({
    cv: { fileName: "sample.pdf", rawText, profile, analysis, blob: file.toString("base64") },
    savedJobDedupeHashes: top.map((j) => j.dedupeHash),
    letter: { jobDedupeHash: top[0].dedupeHash, ...options, content },
  });
  const out = path.join(ROOT, "src/server/demo/template-data.json");
  writeFileSync(out, `${JSON.stringify(template, null, 2)}\n`);
  console.log(
    `Wrote ${out}. Saved jobs: ${top.map((j) => `${j.title} (${j.company})`).join("; ")}`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
