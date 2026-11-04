import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { FogBackground } from "@/components/brand/FogBackground";
import { SiteHeader } from "@/components/layout/SiteHeader";

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
        <RequireUser>{children}</RequireUser>
      </Suspense>
    </>
  );
}
