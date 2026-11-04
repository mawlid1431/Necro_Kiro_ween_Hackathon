import type { AuthConfig } from "convex/server";

// Clerk issues JWTs with the "convex" template; Convex verifies them here.
// Set CLERK_JWT_ISSUER_DOMAIN in the Convex dashboard environment variables.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
