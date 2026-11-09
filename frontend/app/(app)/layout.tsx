import { Suspense } from "react";
import { FogBackground } from "@/components/brand/FogBackground";
import { AppNav } from "@/components/layout/AppNav";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { UserGate } from "@/components/providers/UserGate";
import { ConfirmProvider } from "@/components/ui/confirm";

/**
 * Signed-in area. Sign-in is enforced on the client by UserGate (signed-out visitors are sent
 * to /sign-in) and, for every piece of data, on the server by Convex (requireUser).
 * There is deliberately no `await auth.protect()` here: with cacheComponents that turns each
 * page into a prerender + resume, and Clerk's provider renders a different tree on resume
 * ("Expected the resume to render <ReactClerkProvider>…"), forcing a client re-render.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <FogBackground />
      <SiteHeader />
      <Suspense>
        <ConfirmProvider>
        <UserGate>
          <div className="flex flex-1 flex-col pb-16 md:pb-0">{children}</div>
        </UserGate>
        <nav aria-label="Sections">
          <AppNav mobile />
        </nav>
        </ConfirmProvider>
      </Suspense>
    </>
  );
}
