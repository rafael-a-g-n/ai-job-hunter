"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cv", label: "CV" },
  { href: "/jobs", label: "Jobs" },
  { href: "/jobs/matches", label: "Matches" },
  { href: "/letters", label: "Letters" },
  { href: "/settings", label: "Settings" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/jobs") {
    return (
      pathname === "/jobs" ||
      (pathname.startsWith("/jobs/") && !pathname.startsWith("/jobs/matches"))
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Top bar: nav links (collapsible on mobile) and the user menu. */
export function AppNav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await authClient.signOut().catch(() => undefined);
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex h-12 w-full max-w-5xl items-center gap-2 px-4">
        <Link href="/dashboard" className="mr-2 font-semibold">
          AI Job Hunter
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              label={l.label}
              active={isActive(pathname, l.href)}
            />
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
              <span className="max-w-40 truncate">{email ?? "Account"}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href="/settings" />}>Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Menu"}
          </Button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="grid gap-1 border-t p-2 md:hidden">
          {LINKS.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              label={l.label}
              active={isActive(pathname, l.href)}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </nav>
      )}
    </header>
  );
}

function NavLink({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm hover:bg-muted",
        active ? "bg-muted font-medium" : "text-muted-foreground",
      )}
    >
      {label}
    </Link>
  );
}
