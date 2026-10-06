import { toFile } from 'openai';
import { getClient } from '@/lib/ai';
import { json, error, requireUser } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // a few minutes of speech

/**
 * Voice input for the assistant: the recording from the browser (webm / m4a /
 * ogg / wav) as text, in Persian or English as spoken. Body: multipart "audio".
 */
export async function POST(req) {
  const { error: authErr } = await requireUser();
  if (authErr) return authErr;
  if (!process.env.OPENAI_API_KEY) return error('Voice input needs OPENAI_API_KEY on the server.', 503);
  let form;
  try {
    form = await req.formData();
  } catch {
    return error('Expected the recording as multipart form data.');
  }
  const audio = form.get('audio');
  if (!audio || typeof audio.arrayBuffer !== 'function') return error('No recording.');
  const buf = Buffer.from(await audio.arrayBuffer());
  if (!buf.length) return error('The recording is empty.');
  if (buf.length > MAX_BYTES) return error('The recording is too long — keep it under a few minutes.', 413);
  const type = String(audio.type || 'audio/webm').split(';')[0];
  const ext = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' }[type] || 'webm';
  const file = await toFile(buf, `speech.${ext}`, { type });
  const models = [process.env.TRANSCRIBE_MODEL, 'gpt-4o-transcribe', 'whisper-1'].filter(Boolean);
  let last;
  for (const model of [...new Set(models)]) {
    try {
      const out = await getClient().audio.transcriptions.create({
        file,
        model,
        prompt: 'A Canadian immigration firm: study permit, work permit, visitor visa, IMM forms, intake, Client Information. Persian or English.',
      });
      return json({ text: String(out.text || '').trim() });
    } catch (e) {
      last = e;
    }
  }
  return error(`Could not turn the recording into text: ${last?.message || 'unknown error'}`, 502);
}
