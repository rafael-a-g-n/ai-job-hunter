import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Verify your email" };

export default function Page() {
  return (
    <AuthShell title="Check your email" description="We sent you a verification link.">
      <p className="mb-3 text-sm">
        Open the link in the email to verify your account. You will be signed in automatically.
      </p>
      <Link href="/sign-in" className="text-sm text-muted-foreground underline underline-offset-4">
        Back to sign in
      </Link>
    </AuthShell>
  );
}
