---
name: lexbase-court-outcome
description: How Lexbase court items get their Allowed / Dismissed label. Use before changing courtOutcome in lib/newsletter/lexbase.js, the outcome badge in app/page.jsx, or when a court item shows the wrong or no label.
---

# Lexbase court outcome label

- Court items (`kind === "court"`) show **✓ Allowed · پذیرفته شد** (green) or **✕ Dismissed · رد شد** (red) next to the citation in the topic list.
- `courtOutcome(text)` in `lib/newsletter/lexbase.js` reads it from the summary's own words: "application/JR/appeal is allowed|granted|dismissed", "Application dismissed.", "set aside … remitted/sent back for redetermination" (= allowed). The **last** matching sentence wins (the conclusion). "Leave granted" and "the visa was refused" are not outcomes.
- **Never guess:** no match → `""` → no label.
- It is computed from the item every time (`toCandidate`, and `loadStoredCards` in `lexbase-deck.js`), so stored splits and cards get it without a rewrite. The field travels as `outcome` on candidates, cards (`app/api/topics/route.js`) and workspace topics (`lib/workspace.js` slim keys).
- When changing the patterns, test them with sample sentences, including ones that must give no label.
