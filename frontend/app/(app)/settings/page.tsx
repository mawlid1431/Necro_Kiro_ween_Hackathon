import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { ApiKeys } from "@/components/settings/ApiKeys";
import { PrivacyCard, YourDataCard } from "@/components/settings/PrivacyCard";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { UsageAndExport } from "@/components/settings/UsageAndExport";
import { VoiceForm } from "@/components/settings/VoiceForm";
import { labels, settingsNav } from "@/lib/copy";

export const metadata: Metadata = { title: labels.settings.themed };

export default function SettingsPage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex flex-col gap-8">
        <PageTitle label="settings" />
        <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
          {/* Section list: a sticky sidebar on large screens, a scrollable row of chips on phones. */}
          <nav aria-label="Settings sections" className="lg:sticky lg:top-24 lg:self-start">
            <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:px-0">
              {settingsNav.map((s) => (
                <li key={s.id} className="shrink-0">
                  <a href={`#${s.id}`} className="block rounded-md px-3 py-2 text-meta font-semibold whitespace-nowrap text-subtle transition-colors hover:bg-surface-muted hover:text-ink">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex min-w-0 flex-col gap-6">
            <div id="profile" className="scroll-mt-24"><ProfileForm /></div>
            <div id="voice" className="scroll-mt-24"><VoiceForm /></div>
            <div id="privacy" className="scroll-mt-24"><PrivacyCard /></div>
            <div id="keys" className="scroll-mt-24"><ApiKeys /></div>
            <div id="usage" className="scroll-mt-24"><UsageAndExport /></div>
            <div id="data" className="scroll-mt-24"><YourDataCard /></div>
          </div>
        </div>
      </Container>
    </main>
  );
}
