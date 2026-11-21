const STACK = ["Next.js", "TypeScript", "PostgreSQL + pgvector", "Claude", "Voyage AI", "Vercel"];

export function TechStrip() {
  return (
    <section aria-label="Built with" className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-10 md:flex-row md:items-center md:gap-10">
        <p className="shrink-0 text-sm text-muted-foreground">Built with</p>
        <ul className="flex flex-wrap gap-x-8 gap-y-3 font-heading text-lg font-medium">
          {STACK.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
