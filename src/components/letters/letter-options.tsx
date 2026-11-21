"use client";

import { Label } from "@/components/ui/label";
import type { LetterFormOptions } from "./use-letter-generation";

const SELECTS = [
  {
    key: "tone",
    label: "Tone",
    options: [
      ["FORMAL", "Formal"],
      ["NEUTRAL", "Neutral"],
      ["ENTHUSIASTIC", "Enthusiastic"],
    ],
  },
  {
    key: "language",
    label: "Language",
    options: [
      ["en", "English"],
      ["pt", "Portuguese (Portugal)"],
    ],
  },
  {
    key: "length",
    label: "Length",
    options: [
      ["SHORT", "Short (~150 words)"],
      ["MEDIUM", "Medium (~250 words)"],
      ["LONG", "Long (~350 words)"],
    ],
  },
] as const;

export const DEFAULT_LETTER_OPTIONS: LetterFormOptions = {
  tone: "NEUTRAL",
  language: "en",
  length: "MEDIUM",
};

export function LetterOptions({
  value,
  onChange,
  disabled,
}: {
  value: LetterFormOptions;
  onChange: (value: LetterFormOptions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {SELECTS.map(({ key, label, options }) => (
        <div key={key} className="grid gap-1.5">
          <Label htmlFor={`letter-${key}`}>{label}</Label>
          <select
            id={`letter-${key}`}
            value={value[key]}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            {options.map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
