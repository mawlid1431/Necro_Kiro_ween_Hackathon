"use client";

import type { ReactNode } from "react";

/** Inline Markdown: [title](https://…) links, **bold** and *italic*. Builds React nodes (no innerHTML). */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[((?:\\.|[^\]])+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1] && m[2]) {
      out.push(
        <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer nofollow" className="text-ecto-ink underline underline-offset-4 hover:text-ink">
          {m[1].replace(/\\([[\]\\])/g, "$1")}
        </a>,
      );
    } else if (m[3]) out.push(<strong key={k}>{m[3]}</strong>);
    else if (m[4]) out.push(<em key={k}>{m[4]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The Grimoire as a reader sees it in an email or on LinkedIn: headings, links, source lines, lists. */
export function NewsletterPreview({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${k}`} className="my-3 list-disc space-y-1 pl-5 text-copy">
          {list.map((li, i) => <li key={i}>{inline(li, `li-${k}-${i}`)}</li>)}
        </ul>,
      );
      list = [];
    }
  };
  markdown.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^- /.test(line)) return void list.push(line.slice(2));
    flush(i);
    if (!line.trim()) return;
    if (line.startsWith("# ")) blocks.push(<h1 key={i} className="font-display text-[1.6rem] leading-8 font-bold text-ink">{inline(line.slice(2), `h1-${i}`)}</h1>);
    else if (line.startsWith("## ")) blocks.push(<h2 key={i} className="mt-6 text-h3 font-semibold text-ink">{inline(line.slice(3), `h2-${i}`)}</h2>);
    else if (/^\*[^*].*\*$/.test(line)) blocks.push(<p key={i} className="text-meta font-semibold tracking-wide text-subtle uppercase">{line.slice(1, -1)}</p>);
    else blocks.push(<p key={i} className="my-3 leading-7 text-copy">{inline(line, `p-${i}`)}</p>);
  });
  flush(-1);
  return <div className="mx-auto max-w-2xl rounded-lg border border-line bg-white px-6 py-8 shadow-sm sm:px-10">{blocks}</div>;
}
