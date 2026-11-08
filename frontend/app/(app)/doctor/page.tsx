import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { DoctorList } from "@/components/doctor/DoctorList";
import { labels } from "@/lib/copy";

export const metadata: Metadata = { title: labels.doctor.themed };

export default function DoctorPage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex max-w-3xl flex-col gap-6">
        <PageTitle label="doctor" />
        <DoctorList />
      </Container>
    </main>
  );
}
