import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/layout/AuthShell";

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn />
    </AuthShell>
  );
}
