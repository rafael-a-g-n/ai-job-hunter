import { Suspense } from "react";
import { UsageSummary } from "@/components/app/usage-summary";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { LanguageForm } from "@/components/settings/language-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPreferredLanguage } from "@/server/account/preferences";
import { requireUser } from "@/server/auth/session";
import { getUsageSummary } from "@/server/limits/usage";

async function SettingsContent() {
  const user = await requireUser();
  const [language, usage] = await Promise.all([
    getPreferredLanguage(user.id),
    getUsageSummary(user.id, user.isDemo),
  ]);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Language</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <LanguageForm initial={language} />
          <p className="text-xs text-muted-foreground">
            Used by default for CV feedback and cover letters. The app itself stays in English.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s usage</CardTitle>
        </CardHeader>
        <CardContent>
          <UsageSummary usage={usage} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteAccountForm />
        </CardContent>
      </Card>
    </>
  );
}

export default function SettingsPage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <SettingsContent />
      </Suspense>
    </main>
  );
}
