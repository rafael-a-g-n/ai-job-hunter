"use client";

import { useState, useTransition } from "react";
import { deleteCvAction } from "@/app/(app)/cv/actions";
import { Button } from "@/components/ui/button";

export function DeleteCvButton({ cvId }: { cvId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid justify-items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Delete this CV? Its cover letters and matches are deleted too.")) {
            return;
          }
          setError(null);
          start(async () => {
            const result = await deleteCvAction(cvId);
            if (result && !result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Deleting..." : "Delete CV"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
