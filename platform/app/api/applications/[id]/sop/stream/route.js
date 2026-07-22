import { updateApplication } from '@/lib/store';
import { streamText } from '@/lib/anthropic';
import { buildSopPrompt, selectSopDocs } from '@/lib/generators/sop';
import { buildDocBlocks } from '@/lib/uploads';
import { SOP_QUESTIONS } from '@/lib/sopQuestions';
import { error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 300;

const QIDS = new Set(SOP_QUESTIONS.map((q) => q.id));

/**
 * Stream the Study Plan / SOP as plain-text chunks so long generations don't
 * time out on mobile. Saves the builder answers first; the client persists the
 * final text (and renders the PDF) via POST /sop with { editedText }.
 * Body: { answers: { <qid>: { selected:[], note:'' } } }
 */
export async function POST(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }

  const answers = {};
  if (body.answers && typeof body.answers === 'object') {
    for (const [qid, a] of Object.entries(body.answers)) {
      if (!QIDS.has(qid) || !a) continue;
      answers[qid] = {
        selected: Array.isArray(a.selected) ? a.selected.map(String).slice(0, 12) : [],
        note: typeof a.note === 'string' ? a.note.slice(0, 2000) : '',
      };
    }
  }

  const withAnswers = await updateApplication(app.id, (a) => {
    a.sopAnswers = answers;
    return a;
  });

  // Read the applicant's relevant uploaded documents so the letter is specific.
  let docBlocks = [];
  try {
    docBlocks = await buildDocBlocks(app.id, selectSopDocs(withAnswers));
  } catch {
    docBlocks = [];
  }

  const { system, instruction } = buildSopPrompt(withAnswers, docBlocks.length > 0);
  const content = docBlocks.length ? [{ type: 'text', text: instruction }, ...docBlocks] : instruction;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamText({ system, content, maxTokens: 3000 })) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n[GENERATION ERROR] ${e.message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
