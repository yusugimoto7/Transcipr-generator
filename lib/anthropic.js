import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

let client = null;
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

function extractText(content) {
  return (content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Server-side equivalent of the reference `callClaude`. When `useSearch` is
// true, the web-search server tool is enabled and any `pause_turn` iterations
// are resumed automatically until the model finishes.
//
// max_tokens is generous by default: with web search enabled, a single call's
// output budget has to cover every search tool_use block *and* the final
// synthesized text. A tight budget (e.g. 1000) gets consumed by search calls
// across a multi-category prompt before the model can write its answer,
// truncating mid-sentence with stop_reason "max_tokens" rather than
// "pause_turn" — so raising the resume guard alone would not fix that case.
export async function callClaude(messages, useSearch, maxTokens = useSearch ? 4096 : 1500) {
  const anthropic = getClient();

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [...messages],
  };
  if (useSearch) {
    body.tools = [{ type: "web_search_20260209", name: "web_search" }];
  }

  let response = await anthropic.messages.create(body);
  const textParts = [extractText(response.content)];

  // Resume server-tool loops that pause after hitting the internal iteration cap.
  let guard = 0;
  while (response.stop_reason === "pause_turn" && guard < 10) {
    guard += 1;
    body.messages = [
      ...body.messages,
      { role: "assistant", content: response.content },
    ];
    response = await anthropic.messages.create(body);
    textParts.push(extractText(response.content));
  }

  return textParts.filter(Boolean).join("\n").trim();
}
