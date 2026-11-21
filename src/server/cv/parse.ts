import mammoth from "mammoth";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractText(buf: Buffer, mimeType: string): Promise<string> {
  if (mimeType === PDF_MIME) {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return normalise(text);
  }
  if (mimeType === DOCX_MIME) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return normalise(value);
  }
  throw new Error(`Unsupported mime type: ${mimeType}`);
}
