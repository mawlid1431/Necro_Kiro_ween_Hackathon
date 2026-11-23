# Article images, topics and honest AI labels — requirements

1. WHEN a feed item offers an image (Media RSS content/thumbnail, image enclosure, iTunes image, JSON Feed image, Atom
   enclosure link or the first real `<img>`) THE SYSTEM SHALL store one https URL, preferring the source order above and
   the widest image within a source, and SHALL reject data:, javascript:, credentials and tracking pixels.
2. THE SYSTEM SHALL classify every article into one topic (AI, Security, Web & dev, Tech & gadgets, Design, Science,
   Business, News, Creators, Other) from the feed's categories (x3), title (x2) and excerpt (x1), whole words only.
3. WHEN a real AI model holds a Séance THE SYSTEM SHALL let it confirm or correct the topic (`topicBy: "ai"`); Ghost mode
   keeps the keyword topic.
4. THE SYSTEM SHALL show which model wrote every AI output in plain words ("Written by Llama 3.3 70B · Groq") or
   "Written without AI" for Ghost answers, including image captions, which also warn the user to check them.
5. THE SYSTEM SHALL let the reader filter the Crypt by topic, and hide an image that fails to load.

## Tasks
- [x] `lib/feeds/image.ts` + parser and JSON Feed wiring (unit tests: RSS, Atom, Media RSS, enclosure, JSON Feed, pixels)
- [x] `lib/topics.ts` classifier (unit tests on real-looking headlines, "ai" never inside "said")
- [x] `items.imageUrl`, `items.topic`, `items.topicBy`, `by_user_topic`; `items.backfillMedia` for older articles
- [x] Séance schema `topic` (optional enum) refines the topic when a real model answered
- [x] `lib/ai/modelName.ts` + `<ModelBadge>` on Séance, drafts, Second Opinion, Grimoire and image captions
- [x] Crypt: thumbnail, topic chip, topic filter; reader: lead image when the body does not already show it
