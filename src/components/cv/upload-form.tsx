"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { uploadCvAction } from "@/app/(app)/cv/actions";
import { Button } from "@/components/ui/button";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { LanguageSelect } from "./language-select";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function UploadForm({ defaultLanguage = "en" }: { defaultLanguage?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState(defaultLanguage);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCvId, setFailedCvId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(f: File | undefined) {
    setError(null);
    setFailedCvId(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError("Upload a PDF or DOCX file.");
    if (f.size > MAX_BYTES) return setError("The file is too large. The maximum size is 5 MB.");
    setFile(f);
  }

  function submit() {
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    data.set("language", language);
    setError(null);
    setFailedCvId(null);
    start(async () => {
      const result = await uploadCvAction(data);
      if (result.ok) {
        router.push(`/cv/${result.cvId}`);
        return;
      }
      setError(result.error);
      setFailedCvId(result.cvId ?? null);
    });
  }

  return (
    <div className="grid gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a CV"
        onClick={() => !pending && input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") input.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!pending) pick(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center text-sm",
          dragging ? "border-primary bg-muted" : "border-border",
        )}
      >
        <p className="font-medium">{file ? file.name : "Drag and drop your CV here"}</p>
        <p className="text-muted-foreground">or click to browse. PDF or DOCX, up to 5 MB.</p>
        <input
          ref={input}
          type="file"
          data-testid="cv-file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <LanguageSelect value={language} onChange={setLanguage} disabled={pending} />
        <Button onClick={submit} disabled={!file || pending}>
          {pending ? "Analysing…" : "Upload and analyse"}
        </Button>
      </div>

      {pending && (
        <Progress value={null} aria-live="polite">
          <ProgressLabel>
            Reading your CV and building your report. This can take a minute.
          </ProgressLabel>
        </Progress>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}{" "}
          {failedCvId && (
            <Link href={`/cv/${failedCvId}`} className="underline underline-offset-4">
              View this CV
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
