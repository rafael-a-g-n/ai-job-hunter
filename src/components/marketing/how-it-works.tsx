const STEPS = [
  {
    title: "Upload",
    text: "Add your CV as a PDF or DOCX. You get a score, a breakdown of strengths and gaps, and a profile you can edit.",
  },
  {
    title: "Match",
    text: "Jobs from public sources and ones you paste in are ranked against your profile, with the reasons shown.",
  },
  {
    title: "Apply",
    text: "Pick a job and generate a cover letter in English or Portuguese. Edit it, copy it, send it.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y bg-secondary/50 py-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <h2 className="max-w-xl text-3xl font-semibold sm:text-4xl">
          From CV to application in three steps
        </h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t-2 border-primary pt-5">
              <span className="font-heading text-sm font-semibold text-primary">Step {i + 1}</span>
              <h3 className="mt-1 text-2xl font-semibold">{s.title}</h3>
              <p className="mt-3 max-w-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
