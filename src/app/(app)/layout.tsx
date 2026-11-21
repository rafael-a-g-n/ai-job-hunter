import { Suspense, type ReactNode } from "react";
import { DemoBanner } from "@/components/demo/DemoBanner";

// Minimal for now (banner + page); Task 16 adds the app shell.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense>
        <DemoBanner />
      </Suspense>
      {children}
    </>
  );
}
