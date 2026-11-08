"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Notice } from "@/components/ui/field";
import { settings as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";

const LANGUAGES = ["English", "Malay", "Arabic", "Somali", "French", "Spanish", "German", "Indonesian", "Chinese", "Hindi"];

/** Interests (Séance relevance) and summary language. Completing it marks onboarding done. */
export function ProfileForm() {
  const me = useQuery(api.users.me);
  const setInterests = useMutation(api.users.setInterests);
  const setPreferences = useMutation(api.users.setPreferences);
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const [interests, setText] = useState("");
  const [language, setLanguage] = useState("English");
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    setText(me.interests.join(", "));
    setLanguage(me.summaryLanguage);
  }, [me]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const list = interests.split(",").map((s) => s.trim()).filter(Boolean);
      await setInterests({ interests: list });
      await setPreferences({ summaryLanguage: language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      await completeOnboarding({});
      setStatus({ tone: "ok", text: copy.saved });
    } catch (err) {
      setStatus({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="profile-h">
      <h2 id="profile-h" className="font-display text-h3 font-bold">{copy.interests}</h2>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        <div>
          <Label htmlFor="interests" hint={copy.interestsHint}>{copy.interests}</Label>
          <Input id="interests" value={interests} onChange={(e) => setText(e.target.value)} placeholder="ai, security, design" />
        </div>
        <div>
          <Label htmlFor="language">{copy.language}</Label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-10 w-full rounded-md border-[1.5px] border-line bg-surface px-3 text-body text-ink sm:w-64"
          >
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
        <Button type="submit" disabled={busy} className="self-start">{copy.save}</Button>
      </form>
    </Card>
  );
}
