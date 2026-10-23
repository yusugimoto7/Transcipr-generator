import sharp from "sharp";
import { keepImage } from "../../../../lib/carousel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A picture the team chose for a story page (instead of the AI's), sent from
// the page as a data URL. It is re-encoded here (at most 1600 px, JPEG), so
// only a real image is kept, then stored like the AI pictures.
//   POST { data: "data:image/...;base64,..." }  ->  { url }
export async function POST(request) {
  try {
    const { data } = await request.json();
    const m = String(data || "").match(/^data:image\/(png|jpe?g|webp|heic|heif);base64,([A-Za-z0-9+/=]+)$/i);
    if (!m) return Response.json({ error: "send a picture (JPEG, PNG or WebP)" }, { status: 400 });
    const raw = Buffer.from(m[2], "base64");
    if (raw.length > 12 * 1024 * 1024) return Response.json({ error: "the picture is larger than 12 MB" }, { status: 413 });
    const jpeg = await sharp(raw).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
    const kept = await keepImage(jpeg, `sugimoto-story-upload-${Date.now().toString(36)}`);
    return Response.json({ url: kept.url });
  } catch (e) {
    return Response.json({ error: "the picture could not be read: " + String(e?.message || e).slice(0, 120) }, { status: 400 });
  }
}
