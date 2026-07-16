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
export async function callClaude(messages, useSearch) {
  const anthropic = getClient();

  const body = {
    model: MODEL,
    max_tokens: 1000,
    messages: [...messages],
  };
  if (useSearch) {
    body.tools = [{ type: "web_search_20260209", name: "web_search" }];
  }

  let response = await anthropic.messages.create(body);

  // Resume server-tool loops that pause after hitting the internal iteration cap.
  let guard = 0;
  while (response.stop_reason === "pause_turn" && guard < 5) {
    guard += 1;
    body.messages = [
      ...body.messages,
      { role: "assistant", content: response.content },
    ];
    response = await anthropic.messages.create(body);
  }

  return extractText(response.content);
}
