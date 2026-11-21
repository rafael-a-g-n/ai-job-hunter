"use client";

import { useCompletion } from "@ai-sdk/react";
import { useRef } from "react";

export type LetterFormOptions = {
  tone: "FORMAL" | "NEUTRAL" | "ENTHUSIASTIC";
  language: "en" | "pt";
  length: "SHORT" | "MEDIUM" | "LONG";
};

const FALLBACK_ERROR = "We couldn't write the letter. Please try again.";

class LetterRequestError extends Error {}

/**
 * Streams a cover letter from /api/letters/stream as plain text. The server saves the letter
 * before the stream closes and names it in the `X-Letter-Id` header, so `onSaved` can navigate.
 */
export function useLetterGeneration({ onSaved }: { onSaved: (letterId: string) => void }) {
  const letterId = useRef<string | null>(null);
  const { completion, complete, isLoading, error, stop } = useCompletion({
    api: "/api/letters/stream",
    streamProtocol: "text",
    fetch: async (input, init) => {
      letterId.current = null;
      const res = await fetch(input, init);
      if (!res.ok) {
        const data: { error?: { message?: string } } | null = await res.json().catch(() => null);
        throw new LetterRequestError(data?.error?.message ?? FALLBACK_ERROR);
      }
      letterId.current = res.headers.get("X-Letter-Id");
      return res;
    },
    onFinish: () => {
      if (letterId.current) onSaved(letterId.current);
    },
  });

  return {
    text: completion,
    isLoading,
    // Server errors carry a readable message; a dropped connection or broken stream does not.
    error: error ? (error instanceof LetterRequestError ? error.message : FALLBACK_ERROR) : null,
    stop,
    generate: (jobId: string, options: LetterFormOptions) =>
      complete("", { body: { jobId, ...options } }),
  };
}
