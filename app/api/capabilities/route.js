import { videoWorkflowEnabled } from "../../../lib/video";
import { telegramTarget } from "../../../lib/carousel";
import { storyEnabled } from "../../../lib/story";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which optional actions the page should offer as working.
export async function GET() {
  return Response.json(
    {
      carousel: !!process.env.OPENAI_API_KEY,
      story: storyEnabled(),
      telegram: { review: !!telegramTarget("review"), public: !!telegramTarget("public") },
      video: videoWorkflowEnabled(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
