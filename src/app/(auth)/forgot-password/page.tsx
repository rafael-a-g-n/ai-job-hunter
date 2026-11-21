import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forms";

export const metadata = { title: "Forgot password" };

export default function Page() {
  return (
    <AuthShell title="Forgot password" description="We will email you a link to reset it.">
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
