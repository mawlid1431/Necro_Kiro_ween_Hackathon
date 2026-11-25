import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using Necro.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="November 25, 2026">
      <p>
        These terms apply to Necro at necro.malitos.tech, made by Mowlid Haibe and Arsikin Samaeng. By using
        Necro you agree to them. Our{" "}
        <a href="/privacy">Privacy Policy</a> explains how we handle your data.
      </p>

      <h2>The service</h2>
      <p>
        Necro lets you follow RSS and Atom feeds, read articles, get AI summaries, create social-post drafts, connect your
        own social accounts to post them, and connect AI assistants (such as Kiro, Claude, Cursor or ChatGPT) through its
        MCP server, with a personal key or by signing in with Necro. It is free and provided as is. We
        may change or stop features, and we apply fair-use limits (for example on AI requests and posts per hour).
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your sign-in and your MCP keys private. You are responsible for activity on your account, including what an AI assistant does with a key or connection you created.</li>
        <li>Revoke a key or disconnect an app as soon as you no longer use it, or if you think it was exposed.</li>
        <li>You can delete your account at any time in Settings.</li>
      </ul>

      <h2>Your content and posts</h2>
      <ul>
        <li>
          Feeds and articles belong to their publishers. Necro shows them for your personal reading and links to the
          original. Respect the publishers&apos; rights when you share.
        </li>
        <li>
          AI summaries and drafts can be wrong. Check them before you rely on them or publish them. You are responsible for
          what you post.
        </li>
        <li>
          Posts to LinkedIn, X, Instagram or TikTok are published only when you press Post now, when a post you scheduled
          is due, or when you approve a post your AI assistant prepared. They go out under your own account and must follow
          that platform&apos;s terms and community rules.
        </li>
      </ul>

      <h2>AI assistants (MCP)</h2>
      <ul>
        <li>
          An AI assistant connected with read-only access can read your Necro data. With read-and-write access it can also
          add feeds and post or schedule to your connected accounts, within the same limits as the app.
        </li>
        <li>Check what your assistant proposes before you approve it. Its provider&apos;s own terms apply to how it works and what it does with your data.</li>
        <li>Read-and-write keys and connections expire after 90 days. We may limit or revoke access that harms Necro or other people.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use Necro to break the law, spam, harass, or post content you have no right to share.</li>
        <li>Do not try to break, overload or get around the security or limits of Necro or the services it connects to, including the MCP server&apos;s rate limits.</li>
        <li>Do not share your keys, or use Necro to post automatically on behalf of people who have not agreed to it.</li>
        <li>We may suspend accounts that break these rules.</li>
      </ul>

      <h2>Open source</h2>
      <p>
        Necro&apos;s source code is published under the{" "}
        <a href="https://github.com/mawlid1431/Necro_Kiro_ween_Hackathon/blob/main/LICENSE">MIT License</a>.
      </p>

      <h2>No warranty</h2>
      <p>
        Necro is provided &quot;as is&quot;, without warranty of any kind. To the extent the law allows, we are not liable
        for any loss arising from your use of it, including lost data or posts.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will change the date above when we do. Questions: open an issue on{" "}
        <a href="https://github.com/mawlid1431/Necro_Kiro_ween_Hackathon/issues">GitHub</a>.
      </p>
    </LegalPage>
  );
}
