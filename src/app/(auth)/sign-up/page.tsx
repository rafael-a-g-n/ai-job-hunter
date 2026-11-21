import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/forms";

export const metadata = { title: "Create account" };

export default function Page() {
  return (
    <AuthShell title="Create account" description="Start analysing your CV and matching jobs.">
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
