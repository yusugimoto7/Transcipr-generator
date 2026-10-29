import { guard, json } from "../../../../lib/editing/auth";
import { voiceKeyFor } from "../../../../lib/voice/key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The signed-in person's key for the voice typing extension (Settings shows it).
export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  return json({ key: voiceKeyFor(g.user) });
}
