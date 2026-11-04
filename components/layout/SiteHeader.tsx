import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { HeaderAuth } from "@/components/layout/HeaderAuth";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-page/85 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="shrink-0 rounded-sm" aria-label="Necro home">
          <Logo className="w-28 sm:w-32" priority />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-3">
          <HeaderAuth />
        </nav>
      </Container>
    </header>
  );
}
