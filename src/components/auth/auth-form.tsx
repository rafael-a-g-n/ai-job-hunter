"use client";

import { useState, type ReactNode } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete?: string;
}

interface Props<S extends z.ZodObject> {
  schema: S;
  fields: FieldDef[];
  submitLabel: string;
  /** Resolve with an error message to show inline, or undefined on success. */
  onSubmit: (values: z.infer<S>) => Promise<string | undefined>;
  footer?: ReactNode;
}

/** Zod-validated form that shows field and server errors inline. */
export function AuthForm<S extends z.ZodObject>({
  schema,
  fields,
  submitLabel,
  onSubmit,
  footer,
}: Props<S>) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(undefined);
    const raw = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      setFormError(await onSubmit(parsed.data));
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handle} noValidate className="grid gap-4">
      {fields.map((f) => (
        <div key={f.name} className="grid gap-1.5">
          <Label htmlFor={f.name}>{f.label}</Label>
          <Input
            id={f.name}
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            aria-invalid={errors[f.name] ? true : undefined}
          />
          {errors[f.name] && (
            <p role="alert" className="text-sm text-destructive">
              {errors[f.name]}
            </p>
          )}
        </div>
      ))}
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Please wait…" : submitLabel}
      </Button>
      {footer}
    </form>
  );
}
