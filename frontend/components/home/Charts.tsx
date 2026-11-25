"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Small dependency-free SVG charts for the overview: a dark card, smooth monotone lines with a soft area fill,
// faint grid, dot legend that toggles series, a crosshair tooltip and a short draw-in animation on mount.

export const CHART_COLORS = { green: "#6BC34E", blue: "#60A5FA", amber: "#F59E0B", violet: "#A78BFA", grey: "#9CA3AF" } as const;

export type Series = { key: string; label: string; color: string; values: number[] };

/** The dark card every chart sits in. */
export function ChartCard({ title, description, action, children, className }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#161616] p-[18px] text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_14px_40px_rgba(0,0,0,0.26)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 font-sans text-[16px] leading-[1.15] font-[650] tracking-[-0.02em] text-white">{title}</h2>
          {description ? <p className="mt-[5px] text-[13px] leading-[1.35] text-white/75">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Fritsch–Carlson monotone cubic: smooth, but never overshoots below 0 or above a peak. */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    slope[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1);
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  m[n - 1] = slope[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += ` C${x0 + h},${y0 + m[i] * h} ${x1 - h},${y1 - m[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

/** A round axis maximum: four equal steps of 1, 2, 2.5 or 5 × 10ⁿ (so ticks read 0, 10, 20, 30, 40). */
function niceMax(v: number): number {
  if (v <= 0) return 4;
  const raw = (v * 1.1) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const step = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p);
  return Math.ceil(step) * 4;
}

/** Evenly spaced x labels; the last one always shows and never collides with its neighbour. */
function showTick(i: number, step: number, n: number) {
  return i === n - 1 || (i % step === 0 && n - 1 - i >= step);
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => requestAnimationFrame(() => setW(Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Legend({ series, hidden, onToggle }: { series: Series[]; hidden: Set<string>; onToggle: (k: string) => void }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <li key={s.key}>
          <button
            type="button"
            onClick={() => onToggle(s.key)}
            aria-pressed={!hidden.has(s.key)}
            className={cn("flex items-center gap-1.5 text-[13px] font-medium text-white/85 transition-opacity hover:text-white", hidden.has(s.key) && "opacity-40")}
          >
            <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

type Common = { labels: string[]; series: Series[]; height?: number; format?: (n: number) => string; legend?: boolean; ariaLabel: string };

/** Smooth multi-line chart with area fill. */
export function LineChart({ labels, series, height = 240, format = String, legend = true, ariaLabel }: Common) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const gid = useId().replace(/:/g, "");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const shown = series.filter((s) => !hidden.has(s.key));

  const pad = { l: 36, r: 10, t: 10, b: 26 };
  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...shown.flatMap((s) => s.values)));
  const x = (i: number) => pad.l + (labels.length <= 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const step = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(iw / 56))));

  const paths = shown.map((s) => {
    const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
    const line = smoothPath(pts);
    const area = pts.length ? `${line} L${pts.at(-1)![0]},${pad.t + ih} L${pts[0][0]},${pad.t + ih} Z` : "";
    return { s, line, area };
  });

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - pad.l;
    const i = Math.round((px / Math.max(iw, 1)) * (labels.length - 1));
    setHover(Math.min(labels.length - 1, Math.max(0, i)));
  }

  return (
    <div className="min-w-0">
      {legend ? <Legend series={series} hidden={hidden} onToggle={(k) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; })} /> : null}
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block touch-pan-y">
            <defs>
              {paths.map(({ s }) => (
                <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.07)" strokeDasharray={t === 0 ? undefined : "3 5"} />
                <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="rgba(255,255,255,0.5)" className="tabular-nums">
                  {format(Math.round(t))}
                </text>
              </g>
            ))}
            {labels.map((l, i) =>
              showTick(i, step, labels.length) ? (
                <text key={i} x={x(i)} y={height - 6} textAnchor={i === labels.length - 1 ? "end" : "middle"} fontSize={11} fill="rgba(255,255,255,0.5)">
                  {l}
                </text>
              ) : null,
            )}
            {paths.length === 1 && paths.map(({ s, area }) => (
              <path key={`a-${s.key}`} d={area} fill={`url(#${gid}-${s.key})`} className="animate-in fade-in duration-700 motion-reduce:animate-none" />
            ))}
            {paths.map(({ s, line }) => (
              <path
                key={`l-${s.key}`}
                d={line}
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                className="necro-draw"
              />
            ))}
            {hover !== null ? (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="rgba(255,255,255,0.18)" />
                {shown.map((s) => (
                  <g key={s.key}>
                    <circle cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={9} fill={s.color} opacity={0.18} />
                    <circle cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4} fill={s.color} stroke="#161616" strokeWidth={2} />
                  </g>
                ))}
              </g>
            ) : null}
          </svg>
        ) : null}
        {hover !== null && shown.length ? (
          <Tooltip left={x(hover)} width={width} title={labels[hover]} rows={shown.map((s) => ({ color: s.color, label: s.label, value: format(s.values[hover] ?? 0) }))} />
        ) : null}
      </div>
    </div>
  );
}

/** Rounded bars, one series. */
export function BarChart({ labels, series, height = 140, format = String, ariaLabel }: Common) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const s = series[0];
  const pad = { l: 4, r: 4, t: 6, b: 20 };
  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...(s?.values ?? [])));
  const slot = iw / Math.max(1, labels.length);
  const bw = Math.max(4, Math.min(22, slot * 0.62));
  const step = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(iw / 56))));
  return (
    <div ref={ref} className="relative min-w-0" style={{ height }}>
      {width > 0 && s ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)} className="block">
          <line x1={pad.l} x2={width - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="rgba(255,255,255,0.08)" />
          {s.values.map((v, i) => {
            const h = v > 0 ? Math.max(3, (v / max) * ih) : 0;
            const cx = pad.l + slot * i + slot / 2;
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                <rect x={cx - slot / 2} y={pad.t} width={slot} height={ih} fill="transparent" />
                {h ? (
                  <rect
                    x={cx - bw / 2}
                    y={pad.t + ih - h}
                    width={bw}
                    height={h}
                    rx={Math.min(6, bw / 2, h / 2)}
                    fill={s.color}
                    opacity={hover === null || hover === i ? 0.95 : 0.45}
                    className="necro-grow transition-opacity"
                    style={{ transformOrigin: `${cx}px ${pad.t + ih}px` }}
                  />
                ) : null}
                {showTick(i, step, labels.length) ? (
                  <text x={i === 0 ? cx - bw / 2 : i === labels.length - 1 ? cx + bw / 2 : cx} y={height - 4} textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"} fontSize={11} fill="rgba(255,255,255,0.5)">
                    {labels[i]}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      {hover !== null && s ? (
        <Tooltip left={pad.l + slot * hover + slot / 2} width={width} title={labels[hover]} rows={[{ color: s.color, label: s.label, value: format(s.values[hover] ?? 0) }]} />
      ) : null}
    </div>
  );
}

function Tooltip({ left, width, title, rows }: { left: number; width: number; title: string; rows: { color: string; label: string; value: string }[] }) {
  const flip = left > width - 170;
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-white/10 bg-[#0f0f0f]/95 px-3 py-2 text-[12px] shadow-lg backdrop-blur"
      style={flip ? { right: width - left + 12 } : { left: left + 12 }}
    >
      <p className="mb-1 font-semibold text-white">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-white/70">
          <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />
          <span className="flex-1">{r.label}</span>
          <span className="font-semibold text-white tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Tiny line for stat tiles. */
export function Sparkline({ values, color, className }: { values: number[]; color: string; className?: string }) {
  const W = 100;
  const H = 28;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [values.length <= 1 ? W / 2 : (i / (values.length - 1)) * W, H - 2 - (v / max) * (H - 4)] as [number, number]);
  const line = smoothPath(pts);
  const gid = useId().replace(/:/g, "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-7 w-full", className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {pts.length ? <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${gid})`} /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}
