import { videoWorkflowEnabled } from "../../../lib/video";
import { telegramTarget } from "../../../lib/carousel";
import { storyEnabled } from "../../../lib/story";
import { currentUser } from "../../../lib/editing/auth";
import { accessOf } from "../../../lib/editing/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which optional actions the page should offer as working. With one login for the whole app
// (APP_LOGIN=all), Telegram and WordPress sends are offered only to people with "publishing";
// /api/jobs refuses them too.
export async function GET(request) {
  let publishing = true;
  if (process.env.APP_LOGIN === "all") {
    const user = await currentUser(request).catch(() => null);
    publishing = accessOf(user).includes("publishing");
  }
  return Response.json(
    {
      carousel: !!process.env.OPENAI_API_KEY,
      story: storyEnabled(),
      telegram: publishing ? { review: false, public: !!telegramTarget("public"), english: !!process.env.TELEGRAM_PUBLIC_CHANNEL_ID_EN } : { review: false, public: false, english: false },
      video: videoWorkflowEnabled(),
      publishing,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
