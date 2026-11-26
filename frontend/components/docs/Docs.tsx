"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Check, Code2, Copy, Eye, KeyRound, LifeBuoy, LogIn, MessageSquareText, PenLine, ShieldCheck, Terminal, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { docs as copy, docsAgentPrompt, docsClients, MCP_URL } from "@/lib/copy";
import { cn } from "@/lib/utils";


function CopyButton({ text, label = copy.copy, className }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
      setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("failed");
    }
  }
  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      title={state === "failed" ? copy.copyFailed : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-meta font-semibold text-ink transition-colors hover:bg-surface-muted",
        className,
      )}
    >
      {state === "done" ? <Check aria-hidden className="size-3.5 text-ecto-ink" /> : <Copy aria-hidden className="size-3.5" />}
      <span aria-live="polite">{state === "done" ? copy.copied : label}</span>
    </button>
  );
}

function CodeBlock({ lang, text, copyLabel }: { lang: string; text: string; copyLabel?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-muted">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-[0.75rem] font-semibold tracking-wide text-subtle uppercase">{lang}</span>
        <CopyButton text={text} label={copyLabel} />
      </div>
      <pre className={cn("overflow-x-auto p-4 font-mono text-[0.8125rem] leading-6 text-ink", lang === "prompt" && "max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words")}>
        <code>{text}</code>
      </pre>
    </div>
  );
}

function Section({ id, title, icon: Icon, lead, children }: { id: string; title: string; icon: typeof Bot; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-ecto/15 text-ecto-ink">
          <Icon aria-hidden className="size-4" strokeWidth={1.9} />
        </span>
        <h2 id={`${id}-title`} className="font-display text-h2 font-bold">
          {title}
        </h2>
      </div>
      {lead ? <p className="mt-2 max-w-2xl text-copy">{lead}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

const card = "rounded-2xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]";

/** Public docs: how to connect Kiro, Claude, Cursor, ChatGPT and other MCP clients to Necro. */
export function Docs() {
  const url = MCP_URL;
  const clients = docsClients(url);
  const [active, setActive] = useState(clients[0].id);
  const client = clients.find((c) => c.id === active) ?? clients[0];
  const prompt = docsAgentPrompt(url);
  const [lang, setLang] = useState<string>(copy.build.langs[0].id);
  const code = copy.build.langs.find((l) => l.id === lang) ?? copy.build.langs[0];

  return (
    <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
      {/* Table of contents */}
      <nav aria-label={copy.onThisPage} className="hidden lg:block">
        <div className="sticky top-24">
          <p className="text-overline font-bold text-subtle uppercase">{copy.onThisPage}</p>
          <ul className="mt-3 flex flex-col gap-0.5 border-l border-line">
            {copy.toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-meta font-medium text-subtle transition-colors hover:border-ecto-dim hover:text-ink">
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="flex min-w-0 flex-col gap-16">
        {/* Header */}
        <header id="start" className="scroll-mt-24">
          <p className="text-overline font-bold text-ecto-ink uppercase">{copy.overline}</p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-9 font-bold sm:text-h1">{copy.title}</h1>
          <p className="mt-3 max-w-2xl text-body text-copy">{copy.lead}</p>
          <div className="mt-5 flex max-w-2xl flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-[var(--card-shadow)] sm:flex-row sm:items-center">
            <span className="shrink-0 text-meta font-semibold text-subtle">{copy.endpoint}</span>
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-meta text-ink">{url}</code>
            <CopyButton text={url} />
          </div>

          <ol className="mt-8 grid gap-3 md:grid-cols-3">
            {copy.start.steps.map((s, i) => (
              <li key={s.title} className={card}>
                <span className="grid size-7 place-items-center rounded-full bg-ecto text-meta font-bold text-on-ecto">{i + 1}</span>
                <h3 className="mt-3 text-body font-semibold">{s.title}</h3>
                <p className="mt-1 text-meta text-copy">{s.body}</p>
              </li>
            ))}
          </ol>
        </header>

        <Section id="ways" title={copy.ways.title} icon={Wrench}>
          <div className="grid gap-3 md:grid-cols-2">
            {([
              [KeyRound, copy.ways.key],
              [LogIn, copy.ways.oauth],
            ] as const).map(([Icon, w]) => (
              <div key={w.title} className={card}>
                <div className="flex items-center gap-2">
                  <Icon aria-hidden className="size-4 text-ecto-ink" strokeWidth={1.9} />
                  <h3 className="text-body font-semibold">{w.title}</h3>
                </div>
                <p className="mt-1 text-[0.75rem] font-semibold text-subtle">{w.tag}</p>
                <p className="mt-2 text-meta text-copy">{w.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="key" title={copy.key.title} icon={KeyRound} lead={copy.key.body}>
          <div className="grid gap-3 md:grid-cols-2">
            {([
              [Eye, copy.key.read],
              [PenLine, copy.key.write],
            ] as const).map(([Icon, k]) => (
              <div key={k.title} className={card}>
                <div className="flex items-center gap-2">
                  <Icon aria-hidden className="size-4 text-ecto-ink" strokeWidth={1.9} />
                  <h3 className="text-body font-semibold">{k.title}</h3>
                </div>
                <p className="mt-2 text-meta text-copy">{k.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-meta text-subtle">{copy.key.tip}</p>
            <Button asChild size="sm">
              <Link href="/settings#keys">
                {copy.key.cta} <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </Section>

        <Section id="clients" title={copy.clients.title} icon={Terminal} lead={copy.clients.lead}>
          <div role="tablist" aria-label={copy.clients.title} className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-surface-muted p-1.5">
            {clients.map((c) => (
              <button
                key={c.id}
                role="tab"
                type="button"
                id={`tab-${c.id}`}
                aria-selected={active === c.id}
                aria-controls="client-panel"
                onClick={() => setActive(c.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-meta font-semibold transition-colors",
                  active === c.id ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-subtle hover:text-ink",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div id="client-panel" role="tabpanel" aria-labelledby={`tab-${client.id}`} className={cn(card, "mt-4")}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-h3 font-semibold">{client.name}</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase", client.auth === "oauth" ? "bg-ecto/20 text-ecto-ink" : "bg-candle/20 text-ink")}>
                {client.auth === "oauth" ? copy.authOauth : copy.authKey}
              </span>
              <code className="ml-auto rounded-md bg-surface-muted px-2 py-0.5 font-mono text-[0.75rem] text-subtle">{client.where}</code>
            </div>
            <ol className="mt-4 flex flex-col gap-2.5">
              {client.steps.map((s, i) => (
                <li key={s} className="flex gap-3 text-copy">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line text-[0.6875rem] font-bold text-subtle">{i + 1}</span>
                  <span className="min-w-0 text-meta leading-6">{s}</span>
                </li>
              ))}
            </ol>
            {client.code ? (
              <div className="mt-4">
                <CodeBlock lang={client.code.lang} text={client.code.text} />
              </div>
            ) : null}
          </div>
        </Section>

        <Section id="agent" title={copy.agent.title} icon={Bot} lead={copy.agent.lead}>
          <CodeBlock lang="prompt" text={prompt} copyLabel={copy.agent.copy} />
        </Section>

        <Section id="try" title={copy.try.title} icon={MessageSquareText}>
          <ul className="grid gap-2 md:grid-cols-2">
            {copy.try.items.map((t) => (
              <li key={t} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="text-meta text-copy">“{t}”</span>
                <CopyButton text={t} className="shrink-0 px-2" label={copy.copy} />
              </li>
            ))}
          </ul>
        </Section>

        <Section id="access" title={copy.access.title} icon={Eye} lead={copy.access.lead}>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
            <table className="w-full text-left text-meta">
              <thead className="border-b border-line bg-surface-muted/60">
                <tr>
                  {copy.access.head.map((h, i) => (
                    <th key={h || i} scope="col" className={cn("py-2.5 font-semibold text-ink", i === 0 ? "pr-3 pl-4" : "px-3 text-center")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {copy.access.rows.map(([what, read, full]) => (
                  <tr key={what}>
                    <td className="py-2.5 pr-3 pl-4 text-copy">{what}</td>
                    <td className="px-3 py-2.5 text-center text-copy">{read}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-ink">{full}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="posting" title={copy.posting.title} icon={PenLine} lead={copy.posting.lead}>
          <ol className="grid gap-3 md:grid-cols-2">
            {copy.posting.steps.map((s, i) => (
              <li key={s.title} className={card}>
                <span className="grid size-7 place-items-center rounded-full bg-ecto text-meta font-bold text-on-ecto">{i + 1}</span>
                <h3 className="mt-3 text-body font-semibold">{s.title}</h3>
                <p className="mt-1 text-meta text-copy">{s.body}</p>
              </li>
            ))}
          </ol>
          <h3 className="mt-8 text-body font-semibold text-ink">{copy.posting.routesTitle}</h3>
          <dl className="mt-3 flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
            {copy.posting.routes.map(([where, how]) => (
              <div key={where} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
                <dt className="text-meta font-semibold text-ink">{where}</dt>
                <dd className="text-meta text-copy">{how}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-8 text-body font-semibold text-ink">{copy.posting.platformsTitle}</h3>
          <p className="mt-2 max-w-2xl text-meta text-copy">{copy.posting.platforms}</p>
        </Section>

        <Section id="pictures" title={copy.pictures.title} icon={Eye} lead={copy.pictures.lead}>
          <ul className="grid gap-3 md:grid-cols-3">
            {copy.pictures.items.map(([page, what]) => (
              <li key={page} className={card}>
                <code className="font-mono text-meta font-semibold text-ink">get_page_image {`{ page: "${page}" }`}</code>
                <p className="mt-2 text-meta text-copy">{what}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-2xl text-meta text-subtle">{copy.pictures.note}</p>
        </Section>

        <Section id="tools" title={copy.tools.title} icon={Wrench} lead={copy.tools.lead}>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--card-shadow)]">
            <table className="w-full text-left text-meta">
              <tbody className="divide-y divide-line">
                {copy.tools.list.map(([name, kind, what]) => (
                  <tr key={name}>
                    <td className="py-2.5 pr-3 pl-4 align-top">
                      <code className="font-mono font-semibold text-ink">{name}</code>
                    </td>
                    <td className="hidden py-2.5 pr-3 text-copy sm:table-cell">{what}</td>
                    <td className="py-2.5 pr-4 text-right align-top">
                      <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase", kind === "write" ? "bg-candle/20 text-ink" : "bg-surface-muted text-subtle")}>
                        {kind === "write" ? copy.tools.write : copy.tools.read}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="build" title={copy.build.title} icon={Code2} lead={copy.build.lead}>
          <ol className="grid gap-3 md:grid-cols-2">
            {copy.build.steps.map((s, i) => (
              <li key={s.title} className={card}>
                <span className="grid size-7 place-items-center rounded-full bg-ecto text-meta font-bold text-on-ecto">{i + 1}</span>
                <h3 className="mt-3 text-body font-semibold">{s.title}</h3>
                <p className="mt-1 text-meta text-copy">{s.body}</p>
              </li>
            ))}
          </ol>

          <dl className={cn(card, "mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[8rem_minmax(0,1fr)]")}>
            {copy.build.facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-meta font-semibold text-ink">{k}</dt>
                <dd className="min-w-0 text-meta break-words text-copy">{v}</dd>
              </div>
            ))}
          </dl>

          <div role="tablist" aria-label={copy.build.title} className="mt-6 flex flex-wrap gap-1.5 rounded-xl border border-line bg-surface-muted p-1.5">
            {copy.build.langs.map((l) => (
              <button
                key={l.id}
                role="tab"
                type="button"
                id={`build-tab-${l.id}`}
                aria-selected={lang === l.id}
                aria-controls="build-panel"
                onClick={() => setLang(l.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-meta font-semibold transition-colors",
                  lang === l.id ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-subtle hover:text-ink",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div id="build-panel" role="tabpanel" aria-labelledby={`build-tab-${code.id}`} className="mt-3">
            <p className="mb-2 text-meta text-subtle">{code.note}</p>
            <CodeBlock lang={code.id === "post" ? "jsonc" : code.id === "ts" ? "typescript" : code.id === "py" ? "python" : "bash"} text={code.code} />
          </div>

          <h3 className="mt-8 text-body font-semibold text-ink">{copy.build.oauthTitle}</h3>
          <ol className="mt-3 flex flex-col gap-2.5">
            {copy.build.oauth.map((s, i) => (
              <li key={s} className="flex gap-3 text-copy">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line text-[0.6875rem] font-bold text-subtle">{i + 1}</span>
                <span className="min-w-0 text-meta leading-6 break-words">{s}</span>
              </li>
            ))}
          </ol>

          <ul className={cn(card, "mt-6 flex flex-col gap-3")}>
            {copy.build.tips.map((t) => (
              <li key={t} className="flex gap-2.5 text-meta text-copy">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ecto-ink" /> {t}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="safety" title={copy.safety.title} icon={ShieldCheck}>
          <ul className={cn(card, "flex flex-col gap-3")}>
            {copy.safety.items.map((s) => (
              <li key={s} className="flex gap-2.5 text-meta text-copy">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ecto-ink" /> {s}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="help" title={copy.help.title} icon={LifeBuoy}>
          <div className="flex flex-col gap-2">
            {copy.help.items.map((h) => (
              <details key={h.q} className="group rounded-xl border border-line bg-surface px-5 py-3.5 open:bg-surface-muted/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body font-semibold text-ink">
                  {h.q}
                  <span aria-hidden className="text-subtle transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-meta text-copy">{h.a}</p>
              </details>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
