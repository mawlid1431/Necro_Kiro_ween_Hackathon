---
inclusion: fileMatch
fileMatchPattern: ["frontend/app/**", "frontend/components/**", "frontend/lib/copy.ts"]
---

# Brand rules (from `docs/Necro_Brand_Guide.md`)

Mood: elegant, quiet, a little eerie. Moonlight, fog, green glow. Never gore or cheap horror. Spooky details must support the function (a tombstone is a feed, a glow means new content).

## Theme: light (owner decision, Nov 3 2026)

The app uses a **light theme**. Components use these semantic tokens, never raw brand colours:

| Token | Hex | Use |
|---|---|---|
| page | #FFFFFF | App background |
| surface / surface-muted | #FFFFFF / #F7F4EE | Cards, panels / hover, chips |
| line | #E6E1EC | Borders, dividers, tombstone outlines |
| ink | #0D0A14 | Headings, primary text |
| copy | #2A2236 | Body text |
| subtle | #5E5670 | Secondary text, captions (AA on white) |
| ecto | #7CF29A | Primary button fill (always with `text-ink`), risen glow |
| ecto-ink | #2F7346 | Green text, links, icons on white (AA) |
| highlight | #F5A524 | "New" badge (with `text-ink`) |
| danger | #C8343A | Errors, destructive text (AA on white) |

Logos: use the **light** variants (`/brand/logo-horizontal-light.svg`, `/brand/symbol-light.svg`). Never put ectoplasm green text on white; use `ecto-ink`.

## Brand palette (source colours, from the brand guide)

| Token | Hex | Role |
|---|---|---|
| midnight | #0D0A14 | App background |
| crypt | #17121F | Cards, panels, sidebar |
| grave | #2A2236 | Borders, inputs, tombstones, dividers |
| mist | #8F86A3 | Secondary text, icons, captions |
| fog | #CFC8DC | Body text |
| bone | #F1ECE2 | Headings, primary text |
| ecto | #7CF29A | Primary buttons, risen glow, links, focus |
| ecto-dim | #3E8F58 | Hover/pressed, focus ring |
| candle | #F5A524 | "New" badge, highlights, warnings |
| blood | #E5484D | Errors, destructive |

- Never hard-code hex values in components; use the tokens.
- Primary button: ecto fill, **midnight text**, hover glow `0 0 24px rgba(124,242,154,.35)`. Never white text on ecto.
- Balance: ~70% midnight/crypt, 20% bone/fog text, 10% ecto/candle.

## Type

- Cinzel 700 (`font-display`): logo, page titles, hero, empty-state titles only. Never body text or buttons.
- Plus Jakarta Sans (`font-sans`): everything else.
- Scale utilities: `text-hero`, `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-reader`, `text-meta`, `text-overline`, `text-button`.

## Interface

- Radius: 6 px small, 10 px buttons/inputs, 16 px cards; tombstones `rounded-tomb` (999px 999px 12px 12px).
- Cards: crypt background, 1 px grave border. Secondary button: transparent, 1.5 px grave border, bone text.
- Inputs: crypt fill, grave border, 2 px ecto-dim focus ring.
- Spacing on the 4 px grid.

## Motion

- Rise: lift 4 px + one ecto glow pulse, 600 ms, `cubic-bezier(.2,.8,.2,1)`.
- Fog: slow drifting gradient, 30 to 60 s loop.
- Resurrect drafts: fade up, 150 ms stagger.
- Always honour `prefers-reduced-motion` (fades only). Presets live in `lib/motion.ts`.
- Sound off by default; royalty-free or self-made only.

## Voice

Short sentences, sentence case buttons, no emoji clutter, at most one light joke per screen. Themed labels always have a plain subtitle (see `product.md`).
