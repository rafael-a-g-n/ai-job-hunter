"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { analyzeCvAction } from "@/app/(app)/cv/actions";
import { Button } from "@/components/ui/button";
import { LanguageSelect } from "./language-select";

export function AnalyzeButton({
  cvId,
  label = "Analyse CV",
  defaultLanguage = "en",
}: {
  cvId: string;
  label?: string;
  defaultLanguage?: string;
}) {
  const router = useRouter();
  const [language, setLanguage] = useState(defaultLanguage);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSelect value={language} onChange={setLanguage} disabled={pending} />
        <Button
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const result = await analyzeCvAction(cvId, language);
              if (!result.ok) setError(result.error);
              router.refresh();
            });
          }}
        >
          {pending ? "Analysing…" : label}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
