import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { graveyard } from "@/lib/copy";

export function EmptyGraveyard() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center sm:py-24">
      <Logo variant="symbol" className="w-14 animate-float opacity-90" />
      <h2 className="mt-6 font-display text-h2 font-bold">{graveyard.emptyTitle}</h2>
      <p className="mt-2 max-w-md text-copy">{graveyard.emptyBody}</p>
      <Button asChild variant="link" className="mt-3">
        <Link href="/discover">{graveyard.emptyDiscover}</Link>
      </Button>
    </div>
  );
}
