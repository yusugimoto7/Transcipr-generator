import { guard, json } from "../../../../lib/editing/auth";
import { graphicsTemplates } from "../../../../lib/editing/graphics-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The looks a motion-graphics project can have (the worker's config/graphics_templates.json, never a copy).
export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  return json({ templates: await graphicsTemplates() });
}
