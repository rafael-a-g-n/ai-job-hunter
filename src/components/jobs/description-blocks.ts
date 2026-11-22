export type DescriptionBlock =
  { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

const BULLET = /^[•\-*]\s+/;

/**
 * Splits a plain-text job description (see htmlToText) into paragraphs and bullet lists.
 * A block whose lines all start with a bullet becomes a list; anything else is a paragraph
 * that keeps its own line breaks.
 */
export function toDescriptionBlocks(text: string): DescriptionBlock[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block): DescriptionBlock[] => {
      const lines = block.split("\n").map((l) => l.trim());
      const bullets = lines.filter((l) => BULLET.test(l));
      if (bullets.length === 0) return [{ kind: "paragraph", text: block }];
      if (bullets.length === lines.length) {
        return [{ kind: "list", items: lines.map((l) => l.replace(BULLET, "")) }];
      }
      // A lead-in line followed by bullets ("What you get:\n• a\n• b").
      const firstBullet = lines.findIndex((l) => BULLET.test(l));
      const head = lines.slice(0, firstBullet).join("\n");
      const tail = lines.slice(firstBullet);
      if (tail.every((l) => BULLET.test(l))) {
        return [
          ...(head ? [{ kind: "paragraph" as const, text: head }] : []),
          { kind: "list", items: tail.map((l) => l.replace(BULLET, "")) },
        ];
      }
      return [{ kind: "paragraph", text: block }];
    });
}
