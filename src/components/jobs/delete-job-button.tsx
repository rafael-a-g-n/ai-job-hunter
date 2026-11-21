"use client";

import { useState, useTransition } from "react";
import { deleteManualJobAction } from "@/app/(app)/jobs/actions";
import { Button } from "@/components/ui/button";

export function DeleteJobButton({ jobId }: { jobId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid justify-items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await deleteManualJobAction(jobId);
            if (result && !result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Deleting..." : "Delete"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
