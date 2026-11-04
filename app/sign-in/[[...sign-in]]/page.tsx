import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/layout/AuthShell";

export default function SignInPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="h-[500px]" />}>
        <SignIn />
      </Suspense>
    </AuthShell>
  );
}
