"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { deleteLetterAction, updateLetterAction } from "@/app/(app)/letters/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLetterGeneration, type LetterFormOptions } from "./use-letter-generation";

const AUTOSAVE_MS = 1000;
const MAX_CHARS = 10_000;

type SaveState = "saved" | "saving" | "error";

export function LetterEditor({
  letterId,
  jobId,
  initialContent,
  options,
}: {
  letterId: string;
  jobId: string;
  initialContent: string;
  options: LetterFormOptions;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, startDelete] = useTransition();
  const lastSaved = useRef(initialContent);
  const { isLoading, error, generate } = useLetterGeneration({
    onSaved: (id) => router.push(`/letters/${id}`),
  });

  const contentRef = useRef(initialContent);
  const discard = useRef(false);

  /** Saves right away if there are unsaved edits; resolves to false when the save failed. */
  const flush = useCallback(async (): Promise<boolean> => {
    const pending = contentRef.current;
    if (pending === lastSaved.current) return true;
    setSaveState("saving");
    const result = await updateLetterAction(letterId, pending);
    if (result.ok) {
      lastSaved.current = pending;
      setSaveState("saved");
      setMessage(null);
      return true;
    }
    setSaveState("error");
    setMessage(result.error);
    return false;
  }, [letterId]);

  useEffect(() => {
    if (content === lastSaved.current) return;
    setSaveState("saving");
    const timer = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [content, flush]);

  // Leaving the page (client navigation or unmount) must not drop a pending edit.
  useEffect(() => {
    const save = () => {
      if (!discard.current && contentRef.current !== lastSaved.current) {
        void updateLetterAction(letterId, contentRef.current);
      }
    };
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [letterId]);

  const status = { saved: "Saved", saving: "Saving...", error: "Not saved" }[saveState];

  return (
    <div className="grid gap-3">
      <Textarea
        aria-label="Cover letter"
        value={content}
        maxLength={MAX_CHARS}
        rows={18}
        onChange={(e) => {
          contentRef.current = e.target.value;
          setContent(e.target.value);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span aria-live="polite" className="mr-auto text-xs text-muted-foreground">
          {status}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(content);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setMessage("Could not copy. Select the text and copy it manually.");
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={async () => {
            if (await flush()) void generate(jobId, options);
          }}
        >
          {isLoading ? "Writing..." : "Regenerate"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={deleting}
          onClick={() =>
            startDelete(async () => {
              // The letter is going away, so skip the unmount save.
              discard.current = true;
              const result = await deleteLetterAction(letterId);
              if (!result.ok) {
                discard.current = false;
                setMessage(result.error);
              }
            })
          }
        >
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
      {(error ?? message) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? message}
        </p>
      )}
    </div>
  );
}
