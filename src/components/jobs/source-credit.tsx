import { sourceLabel, sourceSite } from "./posted-ago";

/** "Jobs from <Source>" with a link to the source, for every job that came from an external feed. */
export function SourceCredit({ source }: { source: string }) {
  const site = sourceSite(source);
  if (!site) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Jobs from{" "}
      <a
        href={site}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        {sourceLabel(source)}
      </a>
    </p>
  );
}
