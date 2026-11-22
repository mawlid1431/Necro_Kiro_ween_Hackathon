# Blog draft (dev.to or Hashnode)

Bonus Blog rules: public post on a third-party blog platform, published **during the submission period
(before Dec 4, 2:00 PM PT)**, about Kiro and the project, and it **must say it was written for the Kiroween 2026
hackathon**. Add your own screenshots. Edit freely so it sounds like you.

Suggested tags: `kiro`, `hackathon`, `rss`, `ai`, `nextjs`

---

# I brought RSS back from the dead with Kiro

*This post was written as part of the **Kiroween 2026 hackathon**.*

In 2013 the most popular RSS reader in the world was shut down, and RSS was left for dead. But RSS never died:
almost every blog, newsroom, podcast and YouTube channel still publishes a feed. What died was a good way to use it.

For Kiroween's **Resurrection** category I built **Necro** (https://necro.malitos.tech): an RSS reader that closes
the loop from *reading* to *sharing*.

## The problem

If you read to create — a student, a marketer, a founder — you follow dozens of sources through feeds ranked by an
algorithm, keep twenty tabs open, and copy-paste what you learned into four different apps. Most of it never gets
shared.

## What Necro does

- **Summon** any site, or bring back an old reader's OPML export.
- Each feed becomes a tombstone in **the Graveyard**, and it **rises** when something new is published.
- Read in **the Crypt**, a calm chronological reader.
- **Séance** gives a three-point AI summary and a relevance score for you.
- **Resurrect** writes posts in your own voice for LinkedIn, X, Instagram and TikTok, with a preview that matches
  what will be published.
- **Talk to the Dead** is an MCP server, so an AI assistant (including Kiro) can read and draft from your feeds.

## How Kiro shaped the build

**Steering first.** Before any feature I wrote steering docs: product, tech, structure, security, brand and AI
prompts. Two of them use `fileMatch`, so brand rules only load for UI files and prompt rules only for AI files. The
tech file records version drift (Next.js 16 renamed `middleware.ts` to `proxy.ts`; Clerk 7 changed its components),
which stopped the agent from writing last year's APIs.

**Hooks as a safety net.** The hooks are set up so that saving a test runs it. Saving the database schema updates the README. Saving a component
triggers an accessibility review. A manual "pre-submit" hook checks lint, types, tests, the licence and that `.kiro`
is not gitignored.

**Specs for the hard features.** Each advanced feature has requirements in EARS form ("WHEN … THE SYSTEM SHALL …").
For shared feed collections, one criterion said a curator's email, read state and drafts must never be public; that
became the shape of the query and an isolation test.

**Property-based tests.** The feed parser must never crash on arbitrary input, every item must get a guid and a
title, OPML must round-trip, and every private IP (and its IPv6-mapped form) must be blocked by the fetcher.
fast-check generates the cases I would never think of.

**Custom agents.** A *Feed Doctor* agent that knows RSS and Atom quirks, and a *Copy Editor* that keeps every
spooky name paired with a plain-language subtitle.

## Being honest about tools

I also used Claude Code for part of the build, including direct posting to social accounts. I kept the same Kiro
steering rules, spec format and pre-submit hook for that work, so the project stays consistent.

## What's next

Next: direct posting for everyone once the platforms approve the apps, scheduled posts, and a daily "What rose last night" digest.

Try it: https://necro.malitos.tech · Code (MIT): https://github.com/mawlid1431/Necro_Kiro_ween_Hackathon

#Kiroween #Kiro
