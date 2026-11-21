import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/forms";
import { DemoButton } from "@/components/demo/DemoButton";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <AuthShell title="Sign in" description="Welcome back to AI Job Hunter.">
      <Suspense>
        <SignInForm />
      </Suspense>
      <DemoButton className="mt-4 border-t pt-4" />
    </AuthShell>
  );
}
