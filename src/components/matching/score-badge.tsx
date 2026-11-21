import { cn } from "@/lib/utils";

export function scoreBand(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

const BAND_CLASS = {
  high: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
} as const;

export function ScoreBadge({ score }: { score: number }) {
  const band = scoreBand(score);
  return (
    <span
      data-band={band}
      aria-label={`Match score ${score} out of 100`}
      className={cn(
        "inline-flex h-7 min-w-12 items-center justify-center rounded-full px-2.5 text-sm font-semibold",
        BAND_CLASS[band],
      )}
    >
      {score}
    </span>
  );
}
