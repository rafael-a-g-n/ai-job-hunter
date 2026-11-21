"use client";

import { Label } from "@/components/ui/label";

/** Language the AI writes its feedback in. UI copy stays English. */
export function LanguageSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="cv-language">Feedback language</Label>
      <select
        id="cv-language"
        name="language"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
      >
        <option value="en">English</option>
        <option value="pt">Portuguese</option>
      </select>
    </div>
  );
}
