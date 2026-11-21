"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { VariantProps } from "class-variance-authority";
import { Button, type buttonVariants } from "@/components/ui/button";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      execution: "execute";
      callback: (token: string) => void;
      "error-callback": () => void;
    },
  ): string;
  execute(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile unavailable"));
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Runs the invisible challenge and resolves with its token ("" when no site key is configured). */
async function getToken(container: HTMLElement): Promise<string> {
  if (!SITE_KEY) return "";
  const api = await loadTurnstile();
  return new Promise<string>((resolve, reject) => {
    const id = api.render(container, {
      sitekey: SITE_KEY,
      execution: "execute",
      callback: resolve,
      "error-callback": () => reject(new Error("Challenge failed")),
    });
    api.execute(id);
  });
}

export function DemoButton({
  className,
  variant = "secondary",
  size,
}: { className?: string } & VariantProps<typeof buttonVariants>) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    if (!container.current) return;
    setPending(true);
    setMessage(null);
    try {
      container.current.replaceChildren();
      const turnstileToken = await getToken(container.current);
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnstileToken }),
      });
      const body = (await res.json().catch(() => null)) as {
        redirect?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok || !body?.redirect) {
        setMessage(body?.error?.message ?? "Could not start the demo. Please try again.");
        return;
      }
      router.push(body.redirect);
      router.refresh();
    } catch {
      setMessage("Could not start the demo. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <Button type="button" variant={variant} size={size} onClick={start} disabled={pending}>
        {pending ? "Starting the demo…" : "Try the demo — no sign-up"}
      </Button>
      <div ref={container} />
      {message && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
