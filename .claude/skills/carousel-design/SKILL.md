---
name: carousel-design
description: The team's rules for carousel slide images (what pictures may and may not show). Use before changing the image prompt in lib/carousel.js, the style references in public/brand/carousel-style, or when asked about carousel visuals.
---

# Carousel slide images

Slides are drawn one by one by the image model in `lib/carousel.js` (`imagePrompt`, `drawSlide`), in parallel, with the brand's own carousels in `public/brand/carousel-style/` as style references. The logo is composited afterwards (`addLogo`), never drawn by the model. **No plate behind it** (Hamed, Oct 24 2026): the transparent `logo-on-light.png` (dark letters) where the bottom of the picture is light, `logo-on-dark.png` (white letters) where it is dark, picked by the brightness under the spot (`lib/brandLogo.js`). The same goes for the Telegram picture and the visa-result stories.

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
- **Templates** live in `lib/carousel-templates.js` (no Node imports; the page reads it for the picker, which shows each template's first page). 1 = the brand's classic look (references in `public/brand/carousel-style/`). 2-7 follow the six Canva designs Hamed chose on Oct 21 2026 (Canva ids in `canva`): Yellow collage, Orange bold, Red grid, Paper scrapbook, Green tips, Lime photo. Each is drawn with three of its own pages as references (`public/brand/carousel-templates/<id>/`, exported from Canva at 720px) plus a written style that says what to take and how to mirror it for right-to-left Persian; the references are style only, never their English text, brands or people, and the people / hijab rules above still apply (the Canva pages show people; the slides must not). The carousel stores `template`; ↻ and "draw the missing" use it. To change a template, replace its reference pages and its `style` line.
- **Captions: at most 3 hashtags.** Asked in the prompt and enforced in code (`capHashtags`), on writing and on every save. The caption has a ✏️ to edit it in place.

## Known history
The Oct 12 "evergreen ideas" commit accidentally deleted `parseSlides`, `normaliseMarkers`, `NEWS_RULES` and `FORMAT_REMINDER` from `lib/carousel.js`, so every carousel failed. `next build` does not catch undefined identifiers — after editing, run an undefined-identifier check, e.g. `npx eslint@8 --no-eslintrc --env es2022,node --parser-options ecmaVersion:latest,sourceType:module --rule 'no-undef:error' lib/carousel.js`.

## Persian typography and slide text (the team, Oct 27 2026)
- A cover put the headline's first word «نبود» alone, small, in a cream pill above the rest
  («مدرک مهارت انگلیسی؛ درخواست اجازه کار هم‌وطن ایرانی رد شد»), so the sentence could not be read
  as one. Hamed (Oct 27 2026): that was Farhad's complaint, not the stretched letters; kashida is fine
  where a line needs it. A label box must be a separate title of its own, and where there is none it
  goes. The cover text never has a label line, so the cover prompt (`imagePrompt` in `lib/carousel.js`)
  forbids any label, pill, tag or kicker box on the cover, even where the template's style has one: the
  headline is one block in one size, every word in its place; one key phrase may be highlighted at the
  same size. The Telegram picture (`lib/telegram-post.js`) follows the same rule. (An earlier fix that
  banned kashida was a misreading and was taken back.) `englishPicturePrompt` drops the Persian-only rule.
- The writer sometimes returns a slide as one line; the editor showed it all as the heading with an
  empty body. `lib/slide-text.js` splits such a line after its opening question or clause (heading
  ≤ 90 characters) for the editor and for the drawing; a short cover line stays a heading.
