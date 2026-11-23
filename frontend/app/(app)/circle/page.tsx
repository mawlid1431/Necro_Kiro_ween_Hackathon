import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { PageTabs } from "@/components/layout/PageTabs";
import { PageTitle } from "@/components/layout/PageTitle";
import { FollowingTab, MyProfileCard, PeopleTab, TopicsTab } from "@/components/circle/Circle";
import { labels, tabs } from "@/lib/copy";

export const metadata: Metadata = { title: labels.circle.themed };

export default function CirclePage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex flex-col gap-8">
        <PageTitle label="circle" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <PageTabs
            label={labels.circle.plain}
            tabs={[
              { key: "following", label: tabs.following, content: <FollowingTab /> },
              { key: "topics", label: tabs.inTopics, content: <TopicsTab /> },
              { key: "people", label: tabs.people, content: <PeopleTab /> },
            ]}
          />
          <aside className="lg:sticky lg:top-24">
            <MyProfileCard />
          </aside>
        </div>
      </Container>
    </main>
  );
}
