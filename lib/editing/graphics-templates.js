// The looks offered for motion graphics (Hamed, Nov 4 2026): the worker's own list, config/graphics_templates.json
// on main of english-sugimotovisa, the one place they are defined (the palette and the storyboard guide live there
// too); the app only shows them and sends the chosen id as settings.graphics.template. If the file cannot be read
// the page offers the original look alone, which is what a project without a template draws.
import { getRepoFile } from "./store";

export const ORIGINAL = { id: "canvas", fa: "بوم کلاسیک (قالب قبلی)", en: "Classic canvas (the original)", swatch: ["#EDEBE5", "#16203A", "#F2A516", "#FBFAF6"], source: "" };

export async function graphicsTemplates() {
  try {
    const text = await getRepoFile("config/graphics_templates.json");
    const T = (text && JSON.parse(text).templates) || [];
    const out = T.filter((t) => t && /^[a-z0-9-]{1,30}$/.test(t.id || "")).map((t) => ({ id: t.id, fa: t.fa || t.en, en: t.en || t.fa, swatch: (t.swatch || []).slice(0, 4), source: t.source || "" }));
    return out.length ? out : [ORIGINAL];
  } catch (_) {
    return [ORIGINAL];
  }
}
