import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Necro stores, why, who processes it, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="November 22, 2026">
      <p>
        Necro (necro.malitos.tech) is an RSS reader that summarises articles with AI and helps you share them. It is made
        by Mowlid Haibe and Arsikin Samaeng of <a href="https://barkulanhub.com">Barkulanhub</a>. This page explains
        what we store, why, and how you can delete it. We do not sell your data and we show no ads.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Your account:</strong> your name, email address and profile picture from the sign-in provider (Clerk).</li>
        <li><strong>Your reading:</strong> the feeds you add, the articles fetched from them, what you read or star, your interests and settings.</li>
        <li><strong>AI results:</strong> article summaries and scores (Séance), the social-post drafts you create (Resurrect) and your writing-voice profile if you set one.</li>
        <li><strong>MCP keys:</strong> stored only as a one-way hash; we cannot show them again.</li>
        <li>
          <strong>Connected social accounts</strong> (LinkedIn, X, Instagram, TikTok), only if you connect them: the account
          id, name and picture, and the access tokens the platform gives us, which are stored encrypted (AES-256-GCM) and
          never sent to your browser. We keep a record of each post you publish from Necro (status and link).
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run the reader: fetch your feeds, show new articles and keep your read state.</li>
        <li>To create the AI summaries, answers and drafts you ask for.</li>
        <li>
          To post to a connected social account <strong>only when you press Post now</strong>, with the text and image
          you see in the preview. Necro never reads your social feed, messages or contacts, and never posts on its own.
        </li>
      </ul>

      <h2>Who processes your data</h2>
      <ul>
        <li><strong>Clerk</strong> (sign-in), <strong>Convex</strong> (database) and <strong>Vercel</strong> (hosting).</li>
        <li>
          <strong>AI providers</strong> (Groq, Google Gemini, OpenRouter) receive article text to produce summaries, answers
          and drafts. Your writing-voice samples are never sent to providers that may train on prompts, and Private mode
          in Settings keeps every AI task away from them.
        </li>
        <li>
          <strong>LinkedIn, X, Instagram and TikTok</strong> receive the post you publish, through their official APIs,
          under their own privacy policies.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Read, unstarred articles older than 90 days are deleted automatically every day.</li>
        <li>Disconnecting a social account deletes its stored tokens straight away. You can also remove Necro&apos;s access in that platform&apos;s own settings.</li>
        <li>
          <strong>Deleting your account</strong> (Settings → Your data) deletes everything you own in Necro: feeds,
          articles, summaries, drafts, voice profile, keys and connected accounts.
        </li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Export your feeds as OPML at any time, turn on Private mode, revoke MCP keys, disconnect social accounts, or delete your account.</li>
        <li>Necro uses only the cookies needed to keep you signed in. No advertising or tracking cookies.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions or requests: contact us through <a href="https://barkulanhub.com">barkulanhub.com</a> or open an issue
        on <a href="https://github.com/mawlid1431/Necro_Kiro_ween_Hackathon">GitHub</a>.
      </p>
    </LegalPage>
  );
}
