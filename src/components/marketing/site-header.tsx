import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "./logo";

const ANCHOR = "hidden px-3 text-sm text-muted-foreground hover:text-foreground sm:block";

export function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-5">
      <Logo />
      <nav aria-label="Site" className="ml-auto flex items-center gap-1">
        <Link href="#how-it-works" className={ANCHOR}>
          How it works
        </Link>
        <Link href="#features" className={ANCHOR}>
          Features
        </Link>
        <Link href="/sign-in" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Sign in
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
