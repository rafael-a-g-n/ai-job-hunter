"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateLanguageAction } from "@/app/(app)/settings/actions";
import { Label } from "@/components/ui/label";

export function LanguageForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();

  function change(next: string) {
    const previous = value;
    setValue(next);
    start(async () => {
      const result = await updateLanguageAction(next);
      if (result.ok) toast.success("Default language saved.");
      else {
        setValue(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="preferred-language">AI output language</Label>
      <select
        id="preferred-language"
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
      >
        <option value="en">English</option>
        <option value="pt">Portuguese</option>
      </select>
    </div>
  );
}
