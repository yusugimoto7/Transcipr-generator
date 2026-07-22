import Anthropic from '@anthropic-ai/sdk';

let client;
export function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

/**
 * Call Claude and return the concatenated text of the response.
 * `content` may be a plain string or an array of content blocks (text, document,
 * image) so callers can attach uploaded PDFs/images for extraction.
 */
export async function complete({
  system,
  content,
  maxTokens = 4096,
  model = MODEL,
}) {
  const anthropic = getClient();
  const messages = [
    {
      role: 'user',
      content: typeof content === 'string' ? [{ type: 'text', text: content }] : content,
    },
  ];
  // Note: `temperature` is intentionally omitted — the current Claude models
  // reject it (it is deprecated), so we rely on the model default.
  const res = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
  });
  return res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * Stream a Claude completion as text chunks (async generator). Keeps the HTTP
 * connection alive for long generations so mobile browsers don't time out.
 */
export async function* streamText({ system, content, maxTokens = 4096, model = MODEL }) {
  const anthropic = getClient();
  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [
      {
        role: 'user',
        content: typeof content === 'string' ? [{ type: 'text', text: content }] : content,
      },
    ],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

/**
 * Ask Claude to return JSON and parse it robustly. Throws if no JSON is found.
 */
export async function completeJson(opts) {
  const text = await complete({
    ...opts,
    system:
      (opts.system ? opts.system + '\n\n' : '') +
      'Respond with ONLY valid minified JSON. No markdown, no code fences, no commentary.',
  });
  return parseJsonLoose(text);
}

export function parseJsonLoose(text) {
  if (!text) throw new Error('Empty model response.');
  // Strip code fences if the model added them anyway.
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    // Fall back to the first {...} or [...] balanced-ish slice.
    const start = t.search(/[{[]/);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start !== -1 && end > start) {
      return JSON.parse(t.slice(start, end + 1));
    }
    throw new Error('Could not parse JSON from model response.');
  }
}
