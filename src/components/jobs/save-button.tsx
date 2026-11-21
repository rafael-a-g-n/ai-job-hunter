"use client";

import { useState, useTransition } from "react";
import { toggleSavedJobAction } from "@/app/(app)/jobs/actions";
import { Button } from "@/components/ui/button";

export function SaveButton({ jobId, initialSaved }: { jobId: string; initialSaved: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid justify-items-end gap-1">
      <Button
        variant={saved ? "secondary" : "outline"}
        size="sm"
        disabled={pending}
        aria-pressed={saved}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await toggleSavedJobAction(jobId);
            if (result.ok) setSaved(result.saved);
            else setError(result.error);
          });
        }}
      >
        {saved ? "Saved" : "Save"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
