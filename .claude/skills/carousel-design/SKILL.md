---
name: carousel-design
description: The team's rules for carousel slide images (what pictures may and may not show). Use before changing the image prompt in lib/carousel.js, the style references in public/brand/carousel-style, or when asked about carousel visuals.
---

# Carousel slide images

Slides are drawn one by one by the image model in `lib/carousel.js` (`imagePrompt`, `drawSlide`), in parallel, with the brand's own carousels in `public/brand/carousel-style/` as style references. The logo is composited afterwards (`addLogo`), never drawn by the model.

## Rules from Hamed (keep them)
- **Never show anyone wearing a hijab, headscarf or any head covering.**
- **Not people on every slide.** People are at most in the background, never the subject.
- **Be creative and vary the picture per slide.** Variety is assigned in code (`VISUALS`, by slide number), because slides are drawn separately and the model can't see the others: a scene without people → 3D illustration of objects → flat-lay of real objects → icon infographic → city/landscape view. Add or reorder entries there; don't hand it back to the model.
- References are for **style only** (layout, colours, type, cards) — never their text, subjects, people, logos or university names. The current references contain people; if people keep appearing, replace the references with people-free designs.
- Slide text must be rendered exactly; no fact that is not in the slide text (grounding rule from CLAUDE.md).

## Known history
The Oct 12 "evergreen ideas" commit accidentally deleted `parseSlides`, `normaliseMarkers`, `NEWS_RULES` and `FORMAT_REMINDER` from `lib/carousel.js`, so every carousel failed. `next build` does not catch undefined identifiers — after editing, run an undefined-identifier check, e.g. `npx eslint@8 --no-eslintrc --env es2022,node --parser-options ecmaVersion:latest,sourceType:module --rule 'no-undef:error' lib/carousel.js`.
