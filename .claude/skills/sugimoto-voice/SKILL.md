---
name: sugimoto-voice
description: How Hamed Sugimoto and the Sugimoto Visa team speak and write, learned from their own videos, carousels, Telegram posts and scripts (voice study, Oct–Nov 2026). Three parts: Hamed's spoken voice and chain of thought, the team's voices, and Hamed's carousel writing. Read before changing any writing prompt (scripts, hooks, Telegram, carousel text, captions), the voice samples in lib/sugimoto-voice.js, or when asked why the Topic Engine writes the way it does.
---

# Sugimoto Visa's voice

The evidence, numbers and quotes are in `docs/voice-analysis.md` (sections 1–10) and the one-page
summary `docs/voice-summary.html`. The raw material is on the `editing-data` branch under `voice/`
(91 reel transcripts, 407 carousel posts read slide by slide). The code that carries this skill into
the prompts is `lib/sugimoto-voice.js`; `lib/prompts.js` (`scriptPrompt`, `TG_VOICE`) and
`lib/hooks.js` use it. Never hard-code a voice rule in one prompt only: put it here and in that file.

What stays above every voice rule: facts come only from the source text; the model never invents a
case, a client, a personal experience or an opinion on politics; the glossary names every term;
nothing is published without Hamed's approval.

## 1. Hamed's spoken voice (scripts, Persian and English)

**Decided Nov 1 2026** (Hamed: "go ahead with sugimoto voice", accepting the recommendations of the
summary page). His explainers follow a chain of thought, not a news template. The Persian script
prompt carries it as `CHAIN_FA`, the English one as `CHAIN_EN`:

1. Open with one of three, never a greeting: the viewer's own situation («اگه شما … هستید و
   می‌خواید…»), the news with its number against the last round, or a common misreading («خیلی دقت
   کنید که … نیست که مهمه»). In 44 of his reels nobody opens with «اسکرول نکن» or a sales question.
2. Split the cases («دو تا راه پیش رو دارید»، «دو حالت وجود داره»).
3. Each case's exact consequence: condition, number, deadline, office, right of appeal. He adds the
   numbers up when that is the point («۴۰ + ۷۰ = ۱۱۰، ۴۸۰ می‌شه ۵۵۰»).
4. He says the downside himself («تنها نکتهٔ منفی‌ای که داره اینه که…»); with bad news he calms
   first («اول از همه وحشت نکنید»).
5. He hands the decision back («با توجه به این نکات، شما باید تصمیم بگیرید…»).
6. One comment word.

Language: spoken, «شما», short sentences; spoken verbs beside a formal future («براتون ارسال خواهد
شد»); «پرونده» is his key word (60 times in 44 reels), with «حالا»، «نکته اینه که»، «دقت کنید»،
«طبیعتاً»، «می‌تونید که»; English terms as said in Canada next to the Persian name. Length 250–400
Persian words when the source holds that much (his reels over ~260 words did slightly better).

**Comment word** (`ctaBlockFa`, `ctaWordOf`): a word that gets the viewer something (a list, a points
table, a calculator) drew a median of 56 comments on his reels, «مشاوره» 13. The script route asks the
Telegram post's related-link step (`pickRelatedLink`) for the one sugimotovisa.com page that fits the
topic; with one, the script ends «کلمهٔ «…» رو این پایین بنویسید، لینکش رو براتون می‌فرستیم» and the
topic page shows the word and the page under the Persian script (`CommentWord` in `app/page.jsx`,
saved as `cta_fa` with the script) for the team's DM tool; without one, «مشاوره». English scripts close
on the bio link and never ask for a comment (english-sugimotovisa `config/video_process.json` `cta`).

**A similar case of ours**: about one reel in five uses a real case from the office. The model never
writes one; a Persian script about a kind of file carries the line «[پروندهٔ مشابه ما، اگر داریم: یک
جمله]» before the decision sentence for the team to fill or delete. The English prompts drop any
bracketed line.

**Samples** (`SCRIPT_SAMPLES`): whole explainers of his, corrected for the transcriber's spelling only
(Inland vs Overseas, the officer's two questions in spousal sponsorship, the new CRS points, TRP after
lost status, paystubs for CEC, the procedural fairness letter, the BC entrepreneur opinion). Two are
picked per topic by the words of its title, field and source (`pickScriptSamples`) and appended to
the Persian script prompt only (Persian samples once pulled English scripts into Persian). New
samples: add a whole corrected transcript to `SCRIPT_SAMPLES` with its `on` words.

**Hooks** (`lib/hooks.js`): his three openings (`situation`, `compare`, `misreading`) lead the pattern
list and every set of three hook options holds at least one of them.

Classroom voice (Sugimoto Academy course scripts, Oct 2026): the same person, slower, no hook and no
call to act; a definition, a simple picture («مثل یک صف تصورش کنید»), worked examples with real
numbers, a numbered recap and homework. Reference for long explainers, not for reels.

## 2. The team's voices

- **Telegram (brand, 2025)**: the closest written form of his voice and now the model of `TG_VOICE`
  (`TELEGRAM_SAMPLES_FA`): the news with its number in one line, 🔹 details, «باید ببینیم…» when
  something is not known, 📌 a one-line takeaway; at most three emoji (🚨 ⚠️ 📌 🔹). No call to
  act, no hashtags, no link in the text (added by code). It replaced another channel's posts.
- **Caption writers (SVIG documents)**: comment word first, 2–4 short paragraphs with ✅/♦️, contact
  block, disclaimer; three versions for YouTube, Telegram, LinkedIn. Softly promotional.
- **Border-officer series and job-interview sketches**: a wrong and a right version as dialogue, the
  traveller in street Persian, the officer dry; the legal lesson in the caption (IRPA s.40,
  misrepresentation, five-year ban). Highest reach of the page (median 155,000 views against 21,000
  for explainers). The Topic Engine does not write these; a later phase may suggest an episode idea.
- **Interviews (جویان)**: third person, three practical tips, "full video on YouTube".
- **Emotional narration**: short second-person singular lines, no numbers, always ending on an
  informed choice.
- **Website articles**: formal SEO prose. A source of facts and terms, never a voice sample.
- About ten short explainers read from a written text (Alberta points, cost of study, study plan)
  may be a colleague's; until Hamed says who, they are not samples.

## 3. Hamed's carousel writing (2021–2023)

His own text carousels (119) had a median of 1,904 likes and 89 comments; the team's in 2025–26, 346
and 19. All ten most-liked posts are about the migrant's mind (fear, regret, money, homesickness,
resolve), not a rule. The shape:

- cover of 2–6 words ending in «!» or «؟!» («مهاجرت بدون پول؟!»، «جلدت در مهاجرت!»);
- slide 2 «داستان چیه؟!»: a familiar scene or what people say, then «امروز بهت میگم…»;
- sometimes dialogue in + / − lines, or «بیرون میدون…» against «داخل میدون…»;
- each slide a two-word heading («ذهن آماده…»، «واقعی ببین!») and one whole paragraph of 50–85 words;
- his own experience and real numbers, and the other side said honestly («اشتباه نکنی… قطعاً ارزشش
  رو داره»);
- «حرف آخر…» or «ختم کلام!», then «+ تو بگو: [a question about the reader] / به امید دیدار - حامد
  سوگیموتو», and a last slide «تو بگو:» with the question and one line of invitation;
- second person singular, spoken («بهت میگم»، «میخوای»), idioms («کلاهت پس معرکست»، «شش دانگ»),
  ellipses for pauses; emoji only in the caption;
- caption: the slide-2 line, «💢تو بگو: …», one line of takeaway (today at most 3 hashtags).

News carousels of his were reports in the same spoken voice: «امروز اداره مهاجرت کانادا اعلام
کرد…»، «دسته اول… دسته دوم…»، «هنوز جزییات دقیقی ازش بیرون نیومده»; a mistake was corrected openly in
the caption («❗️اصلاحیه اسلاید پنجم»).

**Not built yet (phase 2):** the carousel prompts still follow `carousel-design` and the
content-playbook §7 news rules; the "Hamed carousel" mode for evergreen topics, the spoken news
carousel, a voice check before a script is shown, a suggested format per topic and the officer
episode idea come next. Hamed's own experience is never written by the model: the Hamed carousel
leaves a marked gap for it.

## 4. Choosing the voice and the kind (Nov 4 2026)

Hamed asked to see which voice wrote a piece and to choose it. `VOICES` in `lib/sugimoto-voice.js`:
`hamed` (default), `team`, `classroom` (scripts only). A script is saved with its `voice` and shows it
as a tag with a switch under the Persian script (`VoicePicker`; switching rewrites both scripts through
job `script` with `voice`). A carousel has a type (`CAROUSEL_KINDS`: `news`, `hamed`) and a voice
chosen before writing; both are saved on the carousel and shown as tags. «متن آمادهٔ خودم» is a
separate mode of the carousel form: paste the whole text in one box, the slides are found by rule
(`parseOwnSlides`), an optional page count caps them, and «طراحی» draws them in the chosen template at
once with no model touching a word (`own: true`, saved as kind `own`).
