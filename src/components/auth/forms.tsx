"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-url";
import { AuthForm } from "./auth-form";
import { authErrorMessage, signInErrorMessage } from "./error-messages";

const email = z.string().trim().email("Enter a valid email address");
const password = z.string().min(8, "Password must be at least 8 characters");

const linkClass = "text-sm text-muted-foreground underline underline-offset-4";

export function SignInForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  return (
    <AuthForm
      schema={z.object({ email, password: z.string().min(1, "Enter your password") })}
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      submitLabel="Sign in"
      onSubmit={async (values) => {
        const { error } = await authClient.signIn.email(values);
        if (error) return signInErrorMessage(error.status);
        router.push(next);
        router.refresh();
        return undefined;
      }}
      footer={
        <div className="flex justify-between">
          <Link href="/forgot-password" className={linkClass}>
            Forgot password?
          </Link>
          <Link href="/sign-up" className={linkClass}>
            Create an account
          </Link>
        </div>
      }
    />
  );
}

export function SignUpForm() {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div className="grid gap-3">
        <p role="status">Check your email to verify your account.</p>
        <Link href="/sign-in" className={linkClass}>
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <AuthForm
      schema={z.object({ name: z.string().trim().min(1, "Enter your name"), email, password })}
      fields={[
        { name: "name", label: "Name", type: "text", autoComplete: "name" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
      ]}
      submitLabel="Create account"
      onSubmit={async (values) => {
        const { error } = await authClient.signUp.email({ ...values, callbackURL: "/dashboard" });
        if (error) return authErrorMessage(error, "Could not create the account.");
        setDone(true);
        return undefined;
      }}
      footer={
        <Link href="/sign-in" className={linkClass}>
          Already have an account? Sign in
        </Link>
      }
    />
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return <p role="status">If an account exists for that email, a reset link is on its way.</p>;
  }
  return (
    <AuthForm
      schema={z.object({ email })}
      fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
      submitLabel="Send reset link"
      onSubmit={async (values) => {
        const { error } = await authClient.requestPasswordReset({
          email: values.email,
          redirectTo: "/reset-password",
        });
        if (error) return authErrorMessage(error, "Could not send the reset link.");
        setSent(true);
        return undefined;
      }}
      footer={
        <Link href="/sign-in" className={linkClass}>
          Back to sign in
        </Link>
      }
    />
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  if (!token || params.get("error")) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="text-sm text-destructive">
          This reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" className={linkClass}>
          Request a new link
        </Link>
      </div>
    );
  }
  return (
    <AuthForm
      schema={z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, {
        message: "Passwords do not match",
        path: ["confirm"],
      })}
      fields={[
        { name: "password", label: "New password", type: "password", autoComplete: "new-password" },
        {
          name: "confirm",
          label: "Confirm password",
          type: "password",
          autoComplete: "new-password",
        },
      ]}
      submitLabel="Reset password"
      onSubmit={async (values) => {
        const { error } = await authClient.resetPassword({ newPassword: values.password, token });
        if (error) return error.message ?? "Could not reset the password.";
        router.push("/sign-in");
        return undefined;
      }}
    />
  );
}
