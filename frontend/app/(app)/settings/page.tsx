import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { ApiKeys } from "@/components/settings/ApiKeys";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { UsageAndExport } from "@/components/settings/UsageAndExport";
import { VoiceForm } from "@/components/settings/VoiceForm";
import { labels } from "@/lib/copy";

export const metadata: Metadata = { title: labels.settings.themed };

export default function SettingsPage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex max-w-3xl flex-col gap-6">
        <PageTitle label="settings" />
        <ProfileForm />
        <VoiceForm />
        <ApiKeys />
        <UsageAndExport />
      </Container>
    </main>
  );
}
