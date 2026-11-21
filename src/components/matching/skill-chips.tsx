import { cn } from "@/lib/utils";

const TONE = {
  match: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  gap: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
} as const;

export function SkillChips({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: keyof typeof TONE;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item} className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONE[tone])}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
