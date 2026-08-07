import OpenAI from 'openai';

/**
 * Single point of contact with the LLM provider (OpenAI / GPT).
 *
 * Callers pass content in a small provider-neutral block format:
 *   { type: 'text',     text }
 *   { type: 'image',    source: { type: 'base64', media_type, data } }
 *   { type: 'document', source: { type: 'base64', media_type, data }, filename }
 * and this module translates it into the OpenAI chat format. Keeping the
 * translation here means the rest of the app never sees provider specifics.
 */

let client;
export function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set on the server.');
  }
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      // Optional — set only for Azure OpenAI, a gateway, or a compatible proxy.
      ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
    });
  }
  return client;
}

export const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

// Reasoning models spend part of the completion budget on hidden reasoning
// tokens, so a cap sized for plain output can leave nothing for the answer.
function isReasoningModel(model) {
  return /^(o\d|gpt-5)/i.test(model);
}

function tokenBudget(maxTokens, model) {
  return isReasoningModel(model) ? maxTokens + 8000 : maxTokens;
}

function dataUrl(source) {
  return `data:${source.media_type};base64,${source.data}`;
}

/** Provider-neutral blocks (or a plain string) -> OpenAI message content. */
function toOpenAIContent(content) {
  if (typeof content === 'string') return content;
  const parts = [];
  let fileNo = 0;
  for (const b of content) {
    if (!b) continue;
    if (b.type === 'text') {
      parts.push({ type: 'text', text: b.text });
    } else if (b.type === 'image' && b.source?.data) {
      parts.push({ type: 'image_url', image_url: { url: dataUrl(b.source) } });
    } else if (b.type === 'document' && b.source?.data) {
      fileNo += 1;
      parts.push({
        type: 'file',
        file: {
          filename: b.filename || `document-${fileNo}.pdf`,
          file_data: dataUrl(b.source),
        },
      });
    }
  }
  return parts;
}

function buildMessages(system, content, history) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  if (history?.length) messages.push(...history);
  if (content !== undefined && content !== null) {
    messages.push({ role: 'user', content: toOpenAIContent(content) });
  }
  return messages;
}

// Older / proxied endpoints may only accept the legacy `max_tokens`; newer
// OpenAI models only accept `max_completion_tokens`. Try the current name and
// fall back once if the server tells us it doesn't know it. The answer is
// remembered so a legacy endpoint isn't probed on every request.
let legacyMaxTokens = false;
let jsonModeUnsupported = false;

function unsupportedParam(e, param) {
  const msg = String(e?.message || '');
  return (
    new RegExp(param, 'i').test(msg) &&
    /(unsupported|unrecognized|unknown|not supported|invalid)/i.test(msg)
  );
}

async function createCompletion(params, budget) {
  if (legacyMaxTokens) {
    return getClient().chat.completions.create({ ...params, max_tokens: budget });
  }
  try {
    return await getClient().chat.completions.create({ ...params, max_completion_tokens: budget });
  } catch (e) {
    if (!unsupportedParam(e, 'max_completion_tokens')) throw e;
    legacyMaxTokens = true;
    return getClient().chat.completions.create({ ...params, max_tokens: budget });
  }
}

/**
 * Call the model and return the text of the response.
 * `content` may be a plain string or an array of blocks (text, document,
 * image) so callers can attach uploaded PDFs/images for extraction.
 */
export async function complete({ system, content, maxTokens = 4096, model = MODEL, jsonMode = false }) {
  // Note: `temperature` is intentionally omitted — several current models
  // accept only the default, so we rely on it everywhere for consistency.
  const useJson = jsonMode && !jsonModeUnsupported;
  const params = {
    model,
    messages: buildMessages(system, content),
    ...(useJson ? { response_format: { type: 'json_object' } } : {}),
  };
  let res;
  try {
    res = await createCompletion(params, tokenBudget(maxTokens, model));
  } catch (e) {
    // JSON mode isn't available on every model — retry once without it. The
    // prompt already demands raw JSON, and parseJsonLoose cleans up the rest.
    if (!useJson || !/response_format/i.test(String(e?.message || ''))) throw e;
    jsonModeUnsupported = true;
    delete params.response_format;
    res = await createCompletion(params, tokenBudget(maxTokens, model));
  }
  return (res.choices?.[0]?.message?.content || '').trim();
}

/**
 * Stream a completion as text chunks (async generator). Keeps the HTTP
 * connection alive for long generations so mobile browsers don't time out.
 */
export async function* streamText({ system, content, maxTokens = 4096, model = MODEL }) {
  const stream = await createCompletion(
    { model, messages: buildMessages(system, content), stream: true },
    tokenBudget(maxTokens, model)
  );
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

/**
 * Multi-turn chat (the in-app assistant). `history` is an array of
 * { role: 'user'|'assistant', content: string | blocks }.
 */
export async function chat({ system, history, maxTokens = 1024, model = MODEL }) {
  const messages = buildMessages(
    system,
    null,
    (history || []).map((m) => ({ role: m.role, content: toOpenAIContent(m.content) }))
  );
  const res = await createCompletion({ model, messages }, tokenBudget(maxTokens, model));
  return (res.choices?.[0]?.message?.content || '').trim();
}

/**
 * Ask the model to return JSON and parse it robustly. Throws if no JSON is found.
 */
export async function completeJson(opts) {
  const text = await complete({
    ...opts,
    jsonMode: true,
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
