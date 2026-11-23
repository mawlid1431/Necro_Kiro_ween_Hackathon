# Brag plan: Necro demo video (Kiroween 2026, Devpost)

Run: `/brag --voice --tone polished --format landscape --duration ~170` · follows `docs/VIDEO_SCRIPT.md` (user's choice) with one added
beat for the Circle and learning memory. The 15–25 s brag default is overridden: Devpost needs an end-to-end demo under 3:00.

## Rubric
1. **Product:** Necro, RSS resurrected with AI: follow any site, read calmly, get a 3-point AI summary, turn it into posts in your voice.
2. **Audience:** people who read to create: students, marketers, founders, researchers.
3. **Core action:** follow → read → understand → share, in one place.
4. **Hero visual:** the Graveyard of tombstone feeds; the Séance card with "Written by … · Groq".
5. **Standout copy:** "RSS is back from the dead", "Summon", "Séance", "Resurrect", "Talk to the dead".
6. **Tone:** polished and calm, with a dry gothic wink (brand: ecto green, ink, bone, Cinzel).
7. **Format:** 1920×1080 landscape, YouTube, English voice-over, captions later on YouTube.
8. **Length:** 2:45–2:55 (hard limit 3:00).
9. **Show first:** the fog and the tombstone logo rising (the hook), then the real app within 40 s.

## Devpost rules (checked on kiroween.devpost.com/rules, 2026-11-24)
- Under 3 minutes; public on YouTube; footage of the project functioning.
- No third-party trademarks: platform logos and names are blurred in every recorded scene; narration says "your social accounts".
- No copyrighted music: a pad synthesized with ffmpeg, ducked under the voice.

## Storyboard (times are targets; the final cut follows the narration audio)
| # | Scene | Kind | On screen | Narration |
|---|---|---|---|---|
| 1 | Hook | graphic | fog, tombstone logo rises | In 2013, the world's favourite RSS reader was switched off, and RSS was left for dead. |
| 2 | Still alive | graphic | real feed names stream past with RSS marks | But it never died. Almost every blog, newsroom and channel still publishes a feed. What died was a good way to use it. |
| 3 | Problem | graphic | endless feed, twenty tabs, copy-paste into four unnamed apps | If you read to create, as a student, a marketer or a founder, you follow dozens of sources through feeds ranked by an algorithm, keep twenty tabs open, and copy-paste into four different apps. Most of it never gets shared. |
| 4 | Solution | graphic | title card "Necro — RSS, resurrected with AI" | Necro brings RSS back to life, and closes the loop from reading to sharing. |
| 5 | Summon | recording | Graveyard → Summon a blog → new tombstone | Paste any website, or bring back your old reader's export in one file. Every feed becomes a tombstone… |
| 6 | Rise | recording | tombstone with risen count, unread climbs | …and when something new is published, it rises. Live. |
| 7 | Crypt + Séance | recording | article with image and topic; Hold a Séance; model badge; Listen | Read in one calm, chronological place, with each article's picture and topic. Séance gives you the three key points, ranks what matters to you, and tells you which AI model wrote it. |
| 8 | Resurrect | recording | drafts, tabs (blurred marks), preview | Resurrect turns the article into posts in your own voice, and the preview is exactly what will be published: same words, same link card, same image. |
| 9 | Share | recording | Copy / schedule in the Witching Hour | Post in one click from your connected accounts, or schedule it. The same post can never go out twice. |
| 10 | Circle + learning (new) | recording | Following stream, Add this feed, "What Necro learned" | Publish, and readers in your topics can follow you in the Circle, and add your sources in one click. And Necro learns what you really read, so its AI gets sharper every day. |
| 11 | Talk to the dead | graphic + real data | MCP client card with a real `what rose today` answer | You can even talk to the dead: ask your AI assistant what rose today, and it answers from your own feeds. |
| 12 | Built with Kiro | graphic + real files | steering rule, hook, EARS spec, tests passing | Built with Kiro: steering rules that keep the agent on our stack and brand, hooks that test as I code, specs with testable requirements, and over two hundred and sixty tests that keep it honest. |
| 13 | Close | graphic | logo + URL | Necro. RSS, resurrected. Try it at necro dot malitos dot tech. |

## Audio
- Voice: Kokoro-82M via `hyperframes tts`, voice `af_heart`, one file per scene; scene length = narration + breathing room.
- Music cue guidance: one ambient pad (ffmpeg-synthesized, royalty-free), −24 dB under the voice, swell on the title card and the close.
- SFX: none (calm tone); cuts land on narration sentence ends.
