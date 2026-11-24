# Article images, topics and honest AI labels — tasks

- [x] 1. `lib/feeds/image.ts` + parser and JSON Feed wiring (req 1; unit tests: RSS, Atom, Media RSS, enclosure,
      JSON Feed, tracking pixels, http upgrade, source priority vs width)
- [x] 2. `lib/topics.ts` classifier (req 2; unit tests on real-looking headlines, "ai" never inside "said", ties,
      feed categories outweigh a passing word, interests → topics)
- [x] 3. Added the Tech & gadgets topic after a live check left half the articles as Other (16 of 30 → 8 of 30)
- [x] 4. `items.imageUrl`, `items.topic`, `items.topicBy`, `by_user_topic`; `items.backfillMedia` (+ `reclassify`)
- [x] 5. Séance `topic` refines the keyword topic when a real model answered (req 3)
- [x] 6. Fix found in a live check: an optional `topic` made Groq's strict structured output reject every Séance
      (HTTP 400), so answers fell back to Ghost mode. `topic` is now required; verified with a real Séance and
      `aiNode:healthCheck` (all 8 tasks answer on dev and production)
- [x] 7. `lib/ai/modelName.ts` + `<ModelBadge>` on Séance, drafts, Second Opinion, Grimoire and image captions (req 4)
- [x] 8. Crypt: thumbnail, topic chip, topic filter; reader lead image only when the body does not show it (req 5)
