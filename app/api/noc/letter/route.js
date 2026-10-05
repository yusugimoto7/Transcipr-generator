import { NextResponse } from "next/server";
import { getUnit } from "../../../../lib/noc/data.js";
import { letterJson, llmReady } from "../../../../lib/noc/llm.js";
import {
  PROGRAMS,
  analysisPrompt,
  rewritePrompt,
  verifyAnalysis,
  verifyRewrite,
} from "../../../../lib/noc/letter.js";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST { mode: "analyze", letter, code, program }
// POST { mode: "rewrite", letter, code, program, analysis, answers }
//
// Nothing is stored: letters carry personal data, and the browser holds the
// only copy.
export async function POST(req) {
  if (!llmReady()) return NextResponse.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 503 });
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { mode = "analyze", letter, code, program = "fsw", analysis, answers = "" } = body || {};

  const unit = getUnit(code);
  if (!unit) return NextResponse.json({ error: "Pick a valid NOC 2021 code first." }, { status: 400 });
  if (!PROGRAMS[program]) return NextResponse.json({ error: `Unknown program: ${program}` }, { status: 400 });
  const text = String(letter || "").trim();
  // A letter shorter than this has nothing to review; the model would only
  // be able to guess.
  if (text.length < 200) return NextResponse.json({ error: "Paste the full letter text (it looks too short)." }, { status: 400 });
  if (text.length > 30000) return NextResponse.json({ error: "Letter text is too long (max 30,000 characters)." }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  try {
    if (mode === "rewrite") {
      const raw = await letterJson(rewritePrompt({ letter: text, unit, program, analysis, answers: String(answers), today }));
      return NextResponse.json({ result: verifyRewrite(raw, { letter: text, answers: String(answers), unit }) });
    }
    const raw = await letterJson(analysisPrompt({ letter: text, unit, program, today }));
    return NextResponse.json({ result: verifyAnalysis(raw, { letter: text, unit, program }) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
