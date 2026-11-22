import type { Metadata } from "next";
import { WitchingHour } from "@/components/calendar/WitchingHour";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { labels } from "@/lib/copy";

export const metadata: Metadata = { title: labels.calendar.themed };

export default function CalendarPage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex flex-col gap-8">
        <PageTitle label="calendar" />
        <WitchingHour />
      </Container>
    </main>
  );
}
