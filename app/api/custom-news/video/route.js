import { writeFile, unlink, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { audioOfFile } from "../../../../lib/video-file";
import { transcribeAudio } from "../../../../lib/video-transcript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// A video (or voice) file the team uploads in Studio → My sources, read as what is said in it
// (Hamed, Nov 12 2026: a TikTok shared from the phone failed: TikTok's public oEmbed no longer names a
// post's caption, its embed refuses servers, and the paid transcript service had no credits left).
// The file is kept on disk only while its sound is taken out (ffmpeg, 16 kHz mono mp3), then
// transcribed (Groq's Whisper, else OpenAI) and deleted. Behind the Topic Engine's login.
const MAX_BYTES = 200 * 1024 * 1024;

export async function POST(request) {
  let dir = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return Response.json({ error: "no file" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "the file is larger than 200 MB" }, { status: 413 });
    if (!/^(video|audio)\//.test(file.type || "") && !/\.(mp4|mov|m4v|webm|mkv|mp3|m4a|wav|aac|ogg)$/i.test(file.name || "")) {
      return Response.json({ error: "choose a video or sound file" }, { status: 400 });
    }
    dir = await mkdtemp(path.join(tmpdir(), "sv-upload-"));
    const src = path.join(dir, "in" + (path.extname(file.name || "") || ".mp4").slice(0, 6));
    await writeFile(src, Buffer.from(await file.arrayBuffer()));
    const audio = await audioOfFile(src);
    await unlink(src).catch(() => {});
    if (!audio) return Response.json({ error: "no sound could be taken from the file" }, { status: 422 });
    const text = String(await transcribeAudio(audio.buf, { name: audio.name, type: audio.type })).trim();
    if (text.length < 40) return Response.json({ error: "nothing was said in the video that could be written down" }, { status: 422 });
    return Response.json({ name: String(file.name || "video").slice(0, 80), text: text.slice(0, 20000) });
  } catch (e) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  } finally {
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
