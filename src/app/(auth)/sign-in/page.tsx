import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/forms";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <AuthShell title="Sign in" description="Welcome back to AI Job Hunter.">
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
