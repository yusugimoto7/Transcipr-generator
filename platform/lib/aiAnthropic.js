/**
 * Anthropic (Claude) as the platform's second, independent model for the
 * document check (lib/verify.js). Called directly over HTTP; the block format
 * the platform uses internally is already the Messages API's.
 *
 *   ANTHROPIC_API_KEY    required to enable it
 *   ANTHROPIC_BASE_URL   tests / proxies only (default https://api.anthropic.com)
 */

const BASE = () => (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const VERSION = '2023-06-01';

export function anthropicAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function toBlocks(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content
    .filter(Boolean)
    .map((b) => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.type === 'image' && b.source?.data) return { type: 'image', source: { type: 'base64', media_type: b.source.media_type, data: b.source.data } };
      if (b.type === 'document' && b.source?.data) return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.source.data } };
      return null;
    })
    .filter(Boolean);
}

/** Text of Claude's reply. */
export async function completeAnthropic({ system, content, maxTokens = 4096, model }) {
  if (!anthropicAvailable()) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const res = await fetch(`${BASE()}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': VERSION },
    body: JSON.stringify({ model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: [{ role: 'user', content: toBlocks(content) }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${data.error?.message || JSON.stringify(data).slice(0, 200)}`);
  return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}
