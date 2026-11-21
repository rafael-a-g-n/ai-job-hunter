import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/forms";

export const metadata = { title: "Reset password" };

export default function Page() {
  return (
    <AuthShell title="Reset password" description="Choose a new password.">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
