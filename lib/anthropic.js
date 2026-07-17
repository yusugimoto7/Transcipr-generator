import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

// Cap the number of web searches per topic generation. This is the single
// biggest cost lever: each search pulls page content into context, and every
// extra search both adds tokens AND makes the model more likely to hit the
// server's internal tool-loop limit (a "pause_turn"), which forces us to
// re-send the whole accumulated context again. Keeping searches low usually
// lets the whole thing finish in ONE request with no re-send at all.
const MAX_SEARCHES = 5;

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
// true, the web-search server tool is enabled (capped at MAX_SEARCHES) and,
// if the model still pauses, we resume — but only a couple of times, since a
// long resume loop re-sends the whole context and is the main cost driver.
export async function callClaude(messages, useSearch, maxTokens = useSearch ? 6000 : 1500) {
  const anthropic = getClient();

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [...messages],
  };
  if (useSearch) {
    body.tools = [
      { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES },
    ];
  }

  let response = await anthropic.messages.create(body);
  const textParts = [extractText(response.content)];

  // Resume a paused server-tool loop at most twice. With MAX_SEARCHES capped
  // this rarely triggers at all; the low cap keeps a runaway resume loop
  // (the previous cost blow-up) from happening.
  let guard = 0;
  while (response.stop_reason === "pause_turn" && guard < 2) {
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
