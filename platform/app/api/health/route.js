import { json, requireUser } from '@/lib/api';
import { complete, MODEL } from '@/lib/ai';

export const runtime = 'nodejs';

/**
 * Health check used by the hosting platform (Render healthCheckPath).
 *
 * `?ai=1` additionally makes one tiny live call to the model provider, so a
 * misconfigured key or model name shows up here instead of failing deep inside
 * an extraction. That branch costs money and is therefore login-only — the
 * plain check the host polls stays public and free.
 */
export async function GET(req) {
  const base = { ok: true, service: 'canada-visa-platform' };

  if (new URL(req.url).searchParams.get('ai') !== '1') return json(base);

  const { error: authErr } = await requireUser();
  if (authErr) return authErr;

  if (!process.env.OPENAI_API_KEY) {
    return json({ ...base, ai: { ok: false, model: MODEL, error: 'OPENAI_API_KEY is not set on the server.' } });
  }
  try {
    const reply = await complete({ content: 'Reply with the single word: ready', maxTokens: 16 });
    return json({ ...base, ai: { ok: true, model: MODEL, reply } });
  } catch (e) {
    return json({ ...base, ai: { ok: false, model: MODEL, error: e.message } });
  }
}
