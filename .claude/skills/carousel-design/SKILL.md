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
- **✏️ under each slide changes only that slide**: the current image goes to `images.edit` with the team's instruction (`editPicture`), everything not asked for is kept, the logo is composited again over the same spot. ↻ draws the slide from scratch. The same edit is used for the Telegram post's picture (`lib/telegram-post.js`). A request about the **words** first goes to a text model with today's date (`rewriteOnPicture`), and the image model is handed the finished text; the slide's stored text follows it. (Oct 21 2026: the image model alone kept "از ژانویه ۲۰۲۵ … اجرا خواهد شد" in future tense after Hamed asked for the right tense.)
- **Tense from today's date** (learned rule, Oct 21 2026): a passed date takes the past tense, a date ahead the future. Built into every writing prompt (`tenseRule` in `lib/today.js`, added by `lessonsBlock`), not left to the learned rule.
- **Never write «مشاورین سوگیموتو ویزا»**; the consultation line asks people to comment «مشاوره» for the booking link (learned rule, Oct 2026).
- Under the carousel: **Schedule / Post right away** to the content calendar (`app/CalendarButtons.jsx`), not Telegram buttons.

## Text first, templates (Hamed, Oct 21 2026)
- The carousel form offers **"✍️ نوشتن متن N اسلاید"** next to "ساخت N اسلاید": the job (`carousel`, `mode: "text"`) writes the slides and caption only and saves a `draft`. The editor (`SlideTextEditor` in `app/page.jsx`) shows a heading and a body box per slide (first line of `content` = heading, the rest = body), the caption and the template; "🎨 طراحی" draws (`mode: "draw"`), "💾 ذخیره" keeps the text (`mode: "save"`). "✍️ متن اسلایدها" opens the same editor over a drawn carousel; drawing again keeps the picture of every slide whose text and template did not change.
- **Templates** live in `lib/carousel-templates.js` (no Node imports; the page reads it for the picker). 1 = the brand's classic look, drawn with the references in `public/brand/carousel-style/`; 2-6 (Slate night, Editorial paper, Full photo, Soft gradient, Bold blocks) are described in words and drawn without the references, so they cannot be pulled back to 1. The carousel stores `template`; ↻ and "draw the missing" use it. Hamed may replace 2-6 (he means to base them on the team's Canva designs).
- **Captions: at most 3 hashtags.** Asked in the prompt and enforced in code (`capHashtags`), on writing and on every save. The caption has a ✏️ to edit it in place.

## Known history
The Oct 12 "evergreen ideas" commit accidentally deleted `parseSlides`, `normaliseMarkers`, `NEWS_RULES` and `FORMAT_REMINDER` from `lib/carousel.js`, so every carousel failed. `next build` does not catch undefined identifiers — after editing, run an undefined-identifier check, e.g. `npx eslint@8 --no-eslintrc --env es2022,node --parser-options ecmaVersion:latest,sourceType:module --rule 'no-undef:error' lib/carousel.js`.
