import { toDescriptionBlocks } from "./description-blocks";

export function JobDescription({ text }: { text: string }) {
  const blocks = toDescriptionBlocks(text);
  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">No description provided.</p>;
  }
  return (
    <div className="max-w-prose space-y-3 text-sm leading-relaxed">
      {blocks.map((block, i) =>
        block.kind === "list" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}
