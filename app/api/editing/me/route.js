import { editingEnabled, currentUser, publicUser, json } from "../../../../lib/editing/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!editingEnabled()) return json({ enabled: false, user: null });
  const user = await currentUser(request).catch(() => null);
  return json({ enabled: true, user: publicUser(user) });
}
