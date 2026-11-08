import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { FogBackground } from "@/components/brand/FogBackground";
import { AppNav } from "@/components/layout/AppNav";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { UserGate } from "@/components/providers/UserGate";

/** Redirects signed-out visitors to sign-in. Convex still checks the user on every call. */
async function RequireUser({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return children;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <FogBackground />
      <SiteHeader />
      <Suspense>
        <RequireUser>
          <UserGate>
            <div className="flex flex-1 flex-col pb-16 sm:pb-0">{children}</div>
          </UserGate>
          <nav aria-label="Sections">
            <AppNav mobile />
          </nav>
        </RequireUser>
      </Suspense>
    </>
  );
}
