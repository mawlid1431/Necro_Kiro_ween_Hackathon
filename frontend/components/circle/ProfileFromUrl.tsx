"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Profile } from "@/components/circle/Circle";
import { labels } from "@/lib/copy";

export function ProfileFromUrl() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <>
      <Link href="/circle" className="inline-flex w-fit items-center gap-1.5 text-meta font-semibold text-subtle hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> {labels.circle.themed}
      </Link>
      <Profile slug={decodeURIComponent(slug ?? "")} />
    </>
  );
}
