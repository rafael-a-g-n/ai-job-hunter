import { Logo } from "./logo";

export const GITHUB_URL = "https://github.com/rafael-a-g-n/ai-job-hunter";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <p className="text-sm text-muted-foreground">
          A portfolio project. Demo accounts are temporary and use sample data.
        </p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium underline underline-offset-4 hover:text-primary"
        >
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}
