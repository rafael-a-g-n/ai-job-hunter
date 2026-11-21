/** Regenerates tests/fixtures/cv/*. Run: npx tsx tests/fixtures/make-fixtures.ts */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";

const out = path.join(__dirname, "cv");
mkdirSync(out, { recursive: true });

const sections: { heading: string; lines: string[] }[] = [
  {
    heading: "Ana Silva",
    lines: ["Frontend Developer - Lisbon, Portugal - ana.silva@example.com"],
  },
  {
    heading: "Summary",
    lines: [
      "Frontend developer with 4 years of experience building fast, accessible web applications",
      "with React and TypeScript. Comfortable owning features from design handoff to production.",
    ],
  },
  {
    heading: "Experience",
    lines: [
      "Frontend Developer, Acme Retail (2022 - present)",
      "- Built a React and TypeScript storefront used by 200,000 monthly customers.",
      "- Cut bundle size by 35 percent and improved Core Web Vitals across key pages.",
      "Junior Frontend Developer, Studio Norte (2020 - 2022)",
      "- Delivered marketing sites and dashboards with React, Next.js and REST APIs.",
    ],
  },
  {
    heading: "Skills",
    lines: ["React, TypeScript, Next.js, HTML, CSS, Tailwind, Jest, Playwright, Git, Figma"],
  },
  {
    heading: "Education",
    lines: ["BSc in Computer Engineering, Instituto Superior Tecnico, Lisbon (2016 - 2019)"],
  },
];

async function makePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  let y = 790;
  for (const s of sections) {
    page.drawText(s.heading, { x: 50, y, size: 14, font: bold });
    y -= 22;
    for (const line of s.lines) {
      page.drawText(line, { x: 50, y, size: 10, font });
      y -= 15;
    }
    y -= 10;
  }
  writeFileSync(path.join(out, "sample.pdf"), await pdf.save());
}

async function makeDocx() {
  const doc = new Document({
    sections: [
      {
        children: sections.flatMap((s) => [
          new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_2 }),
          ...s.lines.map((l) => new Paragraph(l)),
        ]),
      },
    ],
  });
  writeFileSync(path.join(out, "sample.docx"), await Packer.toBuffer(doc));
}

/** Image-only PDF: one embedded raster, no text layer. */
async function makeScannedPdf() {
  const pdf = await PDFDocument.create();
  // 2x2 PNG (grey), valid minimal file.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGNkYGD4z8DAwMDEAAUAFQADAZ7RhQAAAABJRU5ErkJggg==",
    "base64",
  );
  const img = await pdf.embedPng(png);
  const page = pdf.addPage([595, 842]);
  page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  writeFileSync(path.join(out, "scanned.pdf"), await pdf.save());
}

async function makeEmptyDocx() {
  const doc = new Document({ sections: [{ children: [new Paragraph("")] }] });
  writeFileSync(path.join(out, "empty.docx"), await Packer.toBuffer(doc));
}

async function main() {
  await makePdf();
  await makeDocx();
  await makeScannedPdf();
  await makeEmptyDocx();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
