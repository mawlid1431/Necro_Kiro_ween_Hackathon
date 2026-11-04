import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/layout/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp />
    </AuthShell>
  );
}
