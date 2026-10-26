// A spoken review of a cut -> corrections by output second, for the person to check before adding.
// The model only splits and times what was said; it never adds a note of its own.

import { openaiJson } from "../openai";
import { glossaryBlock } from "../glossary.js";

function clock(s) {
  const t = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export async function correctionsFromSpeech(text, durationS) {
  if (!text) return { corrections: [], unclear: [] };
  const prompt = `A reviewer watched a rough cut of a talking-head video${durationS ? ` (${clock(durationS)} long)` : ""} and spoke their notes. The notes are in Farsi, English or both. Split them into corrections.

Each correction has:
- "out": the moment in the video, as m:ss. Times can be said as "1:49", "یک و چهل و نه", "دقیقه یک ثانیه چهل و نه", "ثانیه ۲۰", "second 20", "at the start" (0:00) or "at the end"${durationS ? ` (${clock(durationS)})` : ""}. "A few seconds after that" counts from the previous correction's time.
- "note": what is wrong at that moment, in the reviewer's own words and language, cleaned of filler ("اممم", "um", "یعنی") but never changed in meaning. Do not add advice, causes or anything they did not say.

A note with no time you can work out goes under "unclear" with its words, never into "corrections" with a guessed time. Words that are not about the video (greetings, thinking aloud) are left out.

Answer as JSON: {"corrections": [{"out": "m:ss", "note": "..."}], "unclear": ["..."]}

The spoken notes:
"""${text}"""${await glossaryBlock("fa")}
When a note says a term from the glossary (in Farsi or English), write it in the "note" exactly as the glossary names it.`;
  const raw = await openaiJson(prompt);
  const corrections = (Array.isArray(raw.corrections) ? raw.corrections : [])
    .map((c) => ({ out: String(c.out || "").trim(), note: String(c.note || "").trim().slice(0, 500) }))
    .filter((c) => c.note && /^\d+:\d{1,2}(\.\d+)?$/.test(c.out));
  const unclear = (Array.isArray(raw.unclear) ? raw.unclear : []).map((u) => String(u).trim()).filter(Boolean);
  return { corrections, unclear };
}
