"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DEFAULT_LETTER_OPTIONS, LetterOptions } from "./letter-options";
import { useLetterGeneration, type LetterFormOptions } from "./use-letter-generation";

export function WriteLetterDialog({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LetterFormOptions>(DEFAULT_LETTER_OPTIONS);
  const { text, isLoading, error, stop, generate } = useLetterGeneration({
    onSaved: (id) => router.push(`/letters/${id}`),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isLoading) stop();
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button />}>Write cover letter</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Write a cover letter</DialogTitle>
          <DialogDescription>
            The letter uses only what is in your analysed CV. You can edit it afterwards.
          </DialogDescription>
        </DialogHeader>
        <LetterOptions value={options} onChange={setOptions} disabled={isLoading} />
        {(isLoading || text) && (
          <p
            aria-live="polite"
            className="max-h-60 overflow-y-auto rounded-lg border p-3 text-sm whitespace-pre-wrap"
          >
            {text || "Writing..."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={isLoading} onClick={() => void generate(jobId, options)}>
          {isLoading ? "Writing..." : "Generate"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
