import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/layout/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="h-[500px]" />}>
        <SignUp fallbackRedirectUrl="/dashboard" signInFallbackRedirectUrl="/dashboard" />
      </Suspense>
    </AuthShell>
  );
}
