---
inclusion: always
---

# Product: Necro

**RSS, resurrected with AI.** Built for Kiroween 2026 (category: Resurrection) by Mowlid Haibe. Necro brings RSS back for people who read to create: it follows the sites you choose, tells you what each post says and whether it matters to you, and turns the best of it into posts you share in your own voice.

Full source of truth: `docs/Necro_Project_Documentation.md`.

## Users

- Creators and marketers who read a lot to post well.
- Students and researchers following many blogs and papers.
- Former RSS users with old OPML exports.
- AI power users who want their AI assistant to read their sources (via MCP).

## Features (MVP = 1 to 7, 9)

| # | Feature | Plain meaning |
|---|---|---|
| 1 | Summon | Add feeds: URL, website auto-discovery, OPML upload |
| 2 | The Graveyard | Feeds shown as tombstones; new posts make a tombstone rise |
| 3 | The Crypt | Chronological reader: read/unread, star, search |
| 4 | Séance | AI 3-bullet summary + 0 to 100 relevance score |
| 5 | Resurrect | LinkedIn, X and Instagram drafts in the user's voice |
| 6 | Talk to the dead | MCP server so any AI assistant can list, read, summarise and draft |
| 7 | Feed Doctor | Detect broken or moved feeds and suggest fixes |
| 8 | Haunted digest | Daily "what rose last night" (stretch) |
| 9 | Share | Copy draft or open the platform's official compose page |

## Naming (themed label always carries a plain subtitle)

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

## Out of scope

- Posting directly through social platform APIs (needs app reviews). Use copy + official share links.
- Any third-party trademark or logo. Say "RSS" or "classic feed readers", never the old Google reader's name.
- Copyrighted music or sounds.

## Hackathon rules

- All code written between Oct 30 and Dec 4, 2026. Never copy code from older repositories (the local `reference/` folder is an older, unrelated project and is gitignored).
- Public GitHub repo, MIT `LICENSE` at root, `/.kiro` committed and never gitignored.
- Commits are authored by Mowlid; no co-author or AI attribution trailers.
