import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed middleware.ts to proxy.ts. Clerk 7 deprecates path-based
// protection here, so this only attaches the session; app/(app)/layout.tsx and
// every Convex function do the real auth checks.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
