import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { ConnectCallback } from "@/components/connectors/ConnectCallback";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/post";

// OAuth redirect URI for each platform: /connectors/callback/linkedin | x | instagram | tiktok
export const metadata: Metadata = { title: "Connecting…", robots: { index: false } };

export function generateStaticParams() {
  return SOCIAL_PLATFORMS.map((platform) => ({ platform }));
}

export default async function CallbackPage({ params }: PageProps<"/connectors/callback/[platform]">) {
  const { platform } = await params;
  if (!SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) notFound();
  return (
    <main className="flex-1">
      <Container>
        <ConnectCallback platform={platform as SocialPlatform} />
      </Container>
    </main>
  );
}
