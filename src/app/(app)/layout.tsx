import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/app/app-header";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense>
        <DemoBanner />
      </Suspense>
      <Suspense fallback={<header className="h-12 border-b" />}>
        <AppHeader />
      </Suspense>
      <div className="flex flex-1 flex-col">{children}</div>
      <Toaster />
    </>
  );
}
