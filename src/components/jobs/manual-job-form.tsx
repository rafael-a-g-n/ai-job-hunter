"use client";

import { useState, useTransition } from "react";
import { createManualJobAction } from "@/app/(app)/jobs/new/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ManualJobForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="grid gap-4"
      action={(data) => {
        setError(null);
        start(async () => {
          const result = await createManualJobAction(data);
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="job-text">Job description</Label>
        <Textarea
          id="job-text"
          name="text"
          required
          minLength={50}
          maxLength={20000}
          rows={12}
          placeholder="Paste the full job posting here"
          disabled={pending}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="job-url">Original posting URL (optional)</Label>
        <Input
          id="job-url"
          name="url"
          type="url"
          placeholder="https://example.com/jobs/123"
          disabled={pending}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Importing..." : "Import job"}
        </Button>
      </div>
    </form>
  );
}
