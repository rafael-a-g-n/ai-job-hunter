import { Badge } from "@/components/ui/badge";

const FEATURES = [
  {
    title: "CV analysis",
    text: "A 0 to 100 score with notes on structure, impact and keywords, plus a structured profile pulled from your file.",
  },
  {
    title: "Job matching",
    text: "Semantic search finds roles that fit, then an AI pass explains each match and lists the skills you are missing.",
  },
  {
    title: "Cover letters",
    text: "Letters are written from your CV profile only. Nothing is invented, and you choose the tone and language.",
  },
  {
    title: "Interview simulator",
    text: "Practise answers for a specific job and get feedback on them.",
    soon: true,
  },
];

export function Features() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-5 py-20">
      <h2 className="max-w-xl text-3xl font-semibold sm:text-4xl">
        Everything between CV and offer
      </h2>
      <ul className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <li key={f.title} className={f.soon ? "border-t border-dashed pt-5" : "border-t pt-5"}>
            <h3 className="flex items-center gap-3 text-xl font-semibold">
              {f.title}
              {f.soon && <Badge variant="outline">Coming soon</Badge>}
            </h3>
            <p className="mt-2 max-w-md text-muted-foreground">{f.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
