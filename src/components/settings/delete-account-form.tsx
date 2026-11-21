"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteAccountAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function DeleteAccountForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const result = await deleteAccountAction(text);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // The session is already gone with the user; this clears the cookie.
      await authClient.signOut().catch(() => undefined);
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text === "DELETE") submit();
      }}
    >
      <p className="text-sm text-muted-foreground">
        This permanently deletes your CVs, saved jobs, matches and cover letters. It cannot be
        undone.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
        <Input
          id="delete-confirm"
          autoComplete="off"
          value={text}
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div>
        <Button type="submit" variant="destructive" disabled={pending || text !== "DELETE"}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
      </div>
    </form>
  );
}
