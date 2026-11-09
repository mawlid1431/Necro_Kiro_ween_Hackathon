"use client";
// TEMPORARY visual check, deleted after review. Not committed.
import { MineSection } from "@/components/graveyard/MineSection";
import { VoiceForm } from "@/components/settings/VoiceForm";
import { ConfirmProvider } from "@/components/ui/confirm";

export default function Preview() {
  return (
    <ConfirmProvider>
      <main className="mx-auto flex max-w-5xl flex-col gap-10 p-8">
        <MineSection />
        <VoiceForm />
      </main>
    </ConfirmProvider>
  );
}
