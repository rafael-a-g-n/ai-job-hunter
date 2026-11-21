import type { ReactNode } from "react";

/** Dashed placeholder for a list with nothing in it yet; children say what to do next. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
