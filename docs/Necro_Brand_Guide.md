# Necro Brand Guide

**RSS, resurrected with AI.** · v1.0 · November 2026 · a Faafi project

Visual summary: `Necro_Brand_Assets/necro-brand-sheet.png`

---

## 1. Brand idea

Necro is a graveyard where dead feeds come back to life. The mood is **elegant, quiet and a little eerie**: moonlight, fog and a green glow, never gore or cheap horror. Spooky details must **support the function** (a tombstone is a feed, a glow means new content), which is what the Costume Contest and Design criteria reward.

| We are | We are not |
|---|---|
| Atmospheric, calm, crafted | Gory, loud, cartoonish |
| Clever with theme words | Confusing (every themed label has a plain subtitle) |
| Fast and useful | Decoration that slows the user down |

---

## 2. Logo

**Symbol:** an arched tombstone with the "spreading signal" (dot and two arcs) inside, meaning a dead feed rising again. The signal is the same mark as the Faafi logo, linking Necro to Faafi.
**Wordmark:** NECRO in Cinzel Bold, wide letter spacing, converted to outlines.

| Version | Use on | Colours |
|---|---|---|
| `dark` (primary) | Midnight / dark backgrounds | Ectoplasm tombstone, Midnight signal, Bone wordmark |
| `light` | Bone / light backgrounds | Midnight tombstone, Ectoplasm signal, Midnight wordmark |
| `mono-black` | One-colour print on light | Black |
| `mono-white` | One-colour on photos or dark | White |

**Lockups:** horizontal (default), stacked (square spaces), symbol only (favicons, small UI), wordmark only (titles).

**Clear space:** keep space equal to half the tombstone width on all sides.
**Minimum size:** horizontal 110 px wide; symbol 16 px.

**Do not:** stretch, rotate, recolour, add drop shadows (the UI glow is fine *around* the logo, not baked in), outline, or put it on busy images.

---

## 3. Colour

All text pairings below pass WCAG AA (4.5 : 1) on Midnight.

| Name | HEX | Role | Contrast on Midnight |
|---|---|---|---|
| **Midnight** | `#0D0A14` | App background | |
| **Crypt** | `#17121F` | Cards, panels, sidebar | |
| **Grave** | `#2A2236` | Borders, inputs, tombstones, dividers | |
| **Mist** | `#8F86A3` | Secondary text, icons, captions | 5.7 : 1 |
| **Fog** | `#CFC8DC` | Body text | 12.1 : 1 |
| **Bone** | `#F1ECE2` | Headings, primary text; light-theme background | 16.7 : 1 |
| **Ectoplasm** | `#7CF29A` | Accent: primary buttons, "risen" glow, links, focus | 14.0 : 1 |
| **Ecto dim** | `#3E8F58` | Hover and pressed states, focus ring | |
| **Candle** | `#F5A524` | Highlights, "new" badge, warnings | 9.6 : 1 |
| **Blood** | `#E5484D` | Errors and destructive actions | 5.0 : 1 |

**Balance:** about 70% Midnight/Crypt, 20% Bone/Fog text, 10% Ectoplasm and Candle accents.
**Primary button:** Ectoplasm background with **Midnight text** (14.0 : 1). Never white text on Ectoplasm.
**Atmosphere gradients:** radial Ectoplasm glow at 20 to 35% opacity from the bottom; faint violet `rgba(124,90,180,.25)` from the top left.

---

## 4. Typography

| Role | Font | Weight | Use |
|---|---|---|---|
| Display | **Cinzel** | 700 | Logo, page titles ("The Graveyard"), hero, empty-state titles. **Never for body text or buttons** |
| Interface and body | **Plus Jakarta Sans** | 400, 500, 600, 700 | Everything else |

Both are free (Open Font License). Files are in `Necro_Brand_Assets/08_Fonts/`.

**Type scale (web)**

| Style | Font | Size / line height | Weight | Notes |
|---|---|---|---|---|
| Hero | Cinzel | 64 / 72 px | 700 | Letter spacing 0.04em |
| H1 page title | Cinzel | 36 / 44 px | 700 | |
| H2 section | Plus Jakarta Sans | 24 / 32 px | 700 | -0.01em |
| H3 card title | Plus Jakarta Sans | 18 / 26 px | 600 | |
| Body | Plus Jakarta Sans | 16 / 26 px | 400 | Fog colour |
| Reader (article) | Plus Jakarta Sans | 18 / 30 px | 400 | Max width 68 characters |
| Small / meta | Plus Jakarta Sans | 13 / 20 px | 500 | Mist colour |
| Label / overline | Plus Jakarta Sans | 12 / 16 px | 700 | Uppercase, 0.12em |
| Button | Plus Jakarta Sans | 15 / 20 px | 700 | |

---

## 5. Interface style

| Element | Spec |
|---|---|
| Radius | 6 px small, 10 px buttons and inputs, 16 px cards; tombstone cards use an arched top (`border-radius: 999px 999px 12px 12px`) |
| Cards | Crypt background, 1 px Grave border |
| Primary button | Ectoplasm fill, Midnight text, glow `0 0 24px rgba(124,242,154,.35)` on hover |
| Secondary button | Transparent, 1.5 px Grave border, Bone text |
| Destructive | Blood text or fill |
| Inputs | Crypt fill, Grave border, Ectoplasm focus ring (2 px Ecto dim) |
| Icons | Lucide, 1.75 px stroke, 20 px, Mist or Bone |
| Spacing | 4 px grid: 4, 8, 12, 16, 24, 32, 48, 64 |

**Tombstone feed card:** arched top, feed favicon in a small circle, feed title (H3), unread count chip (Candle when new items), status line ("Alive", "Sleeping", "Broken" with Feed Doctor link).

---

## 6. Motion and sound

| Moment | Effect | Duration |
|---|---|---|
| New item rises | Tombstone lifts 4 px, Ectoplasm glow pulses once | 600 ms, ease `cubic-bezier(.2,.8,.2,1)` |
| Page background | Slow drifting fog layer (CSS gradient animation) | 30 to 60 s loop |
| Resurrect | Drafts fade up one by one with a faint green trail | 150 ms stagger |
| Empty states | Gentle floating ghost or candle flicker | Loop, subtle |

- Respect `prefers-reduced-motion`: replace movement with simple fades.
- **Sound** is **off by default**, with a toggle in Settings. Use short, quiet, royalty-free or self-made sounds (soft chime on rise, low whoosh on resurrect). No copyrighted music anywhere, including the demo video.

---

## 7. Voice and naming

Themed names always carry a plain subtitle, so the app stays easy to use.

| Themed label | Plain subtitle |
|---|---|
| Summon feed | Add a feed |
| The Graveyard | Your feeds |
| The Crypt | Reader |
| Séance | AI summary |
| Resurrect | Create social posts |
| Feed Doctor | Fix broken feeds |
| Bury feed | Remove feed |
| Risen | New |

**Example copy**

- Empty graveyard: *"The graveyard is quiet. Summon your first feed to bring it to life."*
- New items: *"3 feeds rose tonight."*
- Error: *"This feed did not answer. Feed Doctor can try to revive it."*
- Remove confirmation: *"Bury this feed? Its posts will rest in peace (and be deleted)."*

Rules: short sentences, sentence case for buttons, no emoji clutter, one light joke at most per screen.

---

## 8. Assets (in `Necro_Brand_Assets.zip`)

| Folder | Contents |
|---|---|
| 01_Logo_Horizontal | dark, light, mono-black, mono-white · transparent and with background · SVG + PNG 512/1024/2048 |
| 02_Logo_Stacked | same versions |
| 03_App_Icon | dark and light · 16 to 1024 px |
| 04_Symbol | tombstone only, all versions, 16 to 1024 px |
| 05_Wordmark | NECRO only, all versions |
| 06_Favicons | favicon.ico, Apple and Android icons, site.webmanifest |
| 07_Social | OG link preview 1200×630, Devpost cover 1600×900, YouTube thumbnail 1280×720, social post 1200×675 |
| 08_Fonts | Cinzel and Plus Jakarta Sans (TTF and WOFF2, OFL licences) |
| 09_Colors_and_Tokens | `necro-tokens.css` |
| necro-brand-sheet.png | One-page visual summary |

**Tailwind setup (paste into `app/globals.css`, Tailwind v4):**

```css
@theme {
  --color-midnight: #0D0A14;
  --color-crypt: #17121F;
  --color-grave: #2A2236;
  --color-mist: #8F86A3;
  --color-fog: #CFC8DC;
  --color-bone: #F1ECE2;
  --color-ecto: #7CF29A;
  --color-ecto-dim: #3E8F58;
  --color-candle: #F5A524;
  --color-blood: #E5484D;
  --font-display: "Cinzel", Georgia, serif;
  --font-sans: "Plus Jakarta Sans", system-ui, sans-serif;
}
```

Load fonts with `next/font/google` (`Cinzel` weights 600 and 700, `Plus_Jakarta_Sans` weights 400 to 700) or self-host the WOFF2 files from `08_Fonts`.
