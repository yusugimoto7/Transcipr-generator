// Prompter Studio — backend
// Flow:  video link  ->  yt-dlp downloads the audio  ->  OpenAI Whisper transcribes
//                    ->  Claude rewrites into EN + FA teleprompter scripts
//
// Works for YouTube, TikTok and Instagram because yt-dlp handles all three.
// The two API keys live ONLY here on the server, never in the browser.

import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── 1. Pull the audio with yt-dlp ───────────────────────────────
async function downloadAudio(url) {
  const id = randomUUID();
  const outTpl = path.join(os.tmpdir(), `${id}.%(ext)s`);
  const finalPath = path.join(os.tmpdir(), `${id}.mp3`);
  // -x extract audio, force mp3 so the output path is predictable.
  await execFileP(
    "yt-dlp",
    [
      "-f", "bestaudio/best",
      "-x", "--audio-format", "mp3",
      "--no-playlist",
      "--max-filesize", "24M",     // stay under Whisper's 25MB limit
      "-o", outTpl,
      url,
    ],
    { timeout: 120000 }
  );
  return finalPath;
}

// ── 2. Transcribe with OpenAI Whisper ───────────────────────────
async function transcribeAudio(filePath) {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "whisper-1");
  // No language hint -> Whisper auto-detects (handles English or Persian video audio).

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Whisper failed (${res.status}) ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.text || "";
}

// ── /api/transcript ─────────────────────────────────────────────
app.post("/api/transcript", async (req, res) => {
  const { url } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Paste a full video link starting with https://" });
  }
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: "Server is missing OPENAI_API_KEY (needed for transcription)." });
  }
  let audioPath;
  try {
    audioPath = await downloadAudio(url);
    const text = await transcribeAudio(audioPath);
    if (!text.trim()) throw new Error("Got empty transcript back.");
    res.json({ transcript: text.trim() });
  } catch (e) {
    const msg = String(e.message || e);
    let friendly = "Couldn't pull that one. Check the link is public and try again.";
    if (msg.includes("Whisper")) friendly = "The audio downloaded but transcription failed — check your OpenAI key/credits.";
    if (msg.toLowerCase().includes("filesize") || msg.toLowerCase().includes("max-filesize"))
      friendly = "That video's audio is too large for a single pass. Try a shorter clip.";
    res.status(502).json({ error: friendly, detail: msg.slice(0, 300) });
  } finally {
    if (audioPath) fs.unlink(audioPath).catch(() => {});
  }
});

// ── 3. Claude -> bilingual teleprompter scripts ─────────────────
const HOOK_LABELS = {
  question: "Open with a question",
  bold: "Bold statement",
  story: "Mini story",
  myth: "Bust a myth",
};

async function callClaude(system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude failed (${res.status}) ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function parseJSON(text) {
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a !== -1 && b !== -1) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

const enSystem = (voice) => `You are the senior short-form scriptwriter for Hamed Sugimoto, a Regulated Canadian Immigration Consultant (RCIC). You turn rough video transcripts into tight, teleprompter-ready scripts for his Instagram, TikTok and YouTube.

VOICE & RULES:
- ${voice}
- Write for the EAR, not the page: short spoken lines, contractions, a line break wherever he'd take a breath.
- One clear idea. A hook in the very first line. A natural call to action at the end.
- Accurate about Canadian immigration. NEVER promise approvals, PR, visas, timelines or guaranteed outcomes. No "guaranteed / easy / fast" claims. Stay within CICC advertising and ethics standards.
- No emojis, no markdown, no headings, no stage directions inside the script.

Return ONLY valid JSON (no fences) with keys: "hook" (string), "fullScript" (string, line breaks as \\n), "cta" (string), "estReadSeconds" (number).`;

const faSystem = (voice) => `You are Hamed Sugimoto's Persian (Farsi) scriptwriter. You take his finished English script and write the natural Persian version for the same video.

RULES:
- Write fluent, natural spoken Persian. LOCALIZE — never translate word-for-word.
- Same message, hook and call to action as the English. Teleprompter-ready: short spoken lines, breaks where he'd breathe.
- Correct Persian punctuation, right-to-left phrasing. Keep program names (Express Entry, etc.) as commonly used.
- Voice: ${voice}
- Never promise immigration outcomes. No emojis or markdown.

Return ONLY valid JSON (no fences) with keys: "hook" (string), "fullScript" (string, line breaks as \\n), "cta" (string), "estReadSeconds" (number).`;

app.post("/api/scripts", async (req, res) => {
  const { transcript, platform = "short", duration = 45, hook = "question", topic = "", voice = "", langs = { en: true, fa: true } } = req.body || {};
  if (!transcript || !transcript.trim()) return res.status(400).json({ error: "No transcript provided." });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });

  const userMsg = `PLATFORM: ${platform === "short" ? "Short-form vertical video (Reel / TikTok / Short)" : "Longer YouTube segment"}
TARGET LENGTH: about ${duration} seconds when spoken
HOOK STYLE: ${HOOK_LABELS[hook] || "Open with a question"}
TOPIC FOCUS: ${topic.trim() || "(infer the strongest single angle from the transcript)"}

RAW TRANSCRIPT / CAPTIONS:
"""
${transcript.trim()}
"""`;

  try {
    const en = parseJSON(await callClaude(enSystem(voice), userMsg));
    let fa = null;
    if (langs.fa) {
      fa = parseJSON(await callClaude(
        faSystem(voice),
        `Here is the finished English script. Write the Persian version of the SAME video.\n\nENGLISH HOOK: ${en.hook}\n\nENGLISH SCRIPT:\n"""\n${en.fullScript}\n"""`
      ));
    }
    res.json({ en: langs.en ? en : null, fa });
  } catch (e) {
    res.status(502).json({ error: "Script generation failed — try again.", detail: String(e.message || e).slice(0, 300) });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, keys: { anthropic: !!ANTHROPIC_KEY, openai: !!OPENAI_KEY } }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Prompter Studio running on :${PORT}`));
