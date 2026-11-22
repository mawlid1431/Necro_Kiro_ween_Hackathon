# Connectors — tasks

- [x] 1. Research each platform's official OAuth and posting docs; write plan and goal (`docs/specs/connectors.md`)
- [x] 2. One post string for preview, counter, copy, share and API (`finalPost`, `postLength`)
- [x] 3. Real link cards from Open Graph tags (`/api/link-preview`, `og.ts`)
- [x] 4. Post image route with signed JPEG links for Instagram and TikTok
- [x] 5. Compact menu button below `lg`; Connectors link in the nav
- [x] 6. Convex tables `connections`, `oauthStates`, `publishes`; account deletion removes them
- [x] 7. Token sealing (AES-256-GCM) and provider module for LinkedIn, X, Instagram, TikTok
- [x] 8. Actions: begin, complete, publish, tiktokCreator; daily Instagram token refresh cron
- [x] 9. Connectors page and OAuth callback page
- [x] 10. Resurrect: TikTok tab, Post now with live status, TikTok posting choices
- [x] 11. Unit tests (`backend/tests/unit/social.test.ts`): post text, X counting, sealing, signed links, card parsing, escaping, OAuth URLs, error mapping
- [ ] 12. Create the four developer apps and set their keys (owner)
- [ ] 13. Real post to each platform from the live site and record the result here
