// The hand editor's filmstrip, made on the server (Hamed, 5 Nov 2026: "the clips at the bottom are all
// black; I have to tap at random to find a piece", on an iPhone). The editor used to draw its frames
// itself from a hidden video, which iPhone Safari never loads, so every tile stayed black. Here ffmpeg
// reads the copy the editor plays (only its keyframes: the original's light copy has one every second)
// and lays the frames out as one JPEG grid; the editor shows a piece of that one picture in each tile,
// which is also what keeps dragging a clip's edge smooth (a tile is a background position, not a
// picture of its own).
import { spawn } from "child_process";
import sharp from "sharp";

const COLS = 20, TILE_W = 48, MAX_FRAMES = 480;
const cache = globalThis.__heStrips || (globalThis.__heStrips = new Map()); // drive id -> Promise<{ buf, meta }>

const fileUrl = (id) => `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;

function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [], err = [];
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("error", (e) => { clearTimeout(timer); reject(e.code === "ENOENT" ? new Error(cmd + " is not installed on the server") : e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${cmd} stopped (${code}): ${Buffer.concat(err).toString().slice(-300)}`));
    });
  });
}

async function make(id) {
  const url = fileUrl(id);
  const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", url], 60000)).toString());
  const duration = Number(probe.format && probe.format.duration) || 0;
  if (!duration) throw new Error("the video's length could not be read");
  const step = Math.max(1, duration / MAX_FRAMES);
  const count = Math.max(1, Math.ceil(duration / step));
  const rows = Math.ceil(count / COLS);
  const buf = await run(
    "ffmpeg",
    ["-v", "error", "-skip_frame", "nokey", "-i", url, "-an", "-vf", `fps=1/${step},scale=${TILE_W}:-2,tile=${COLS}x${rows}`, "-frames:v", "1", "-q:v", "6", "-f", "image2", "-c:v", "mjpeg", "pipe:1"],
    240000
  );
  const m = await sharp(buf).metadata();
  return { buf, meta: { step, count, cols: COLS, w: TILE_W, h: Math.round(m.height / rows), width: m.width, height: m.height } };
}

// The grid for a Drive file, made once per server start (a failed one is tried again next time).
export function filmstrip(id) {
  if (!cache.has(id)) {
    const p = make(id);
    cache.set(id, p);
    p.catch(() => cache.delete(id));
    if (cache.size > 12) cache.delete(cache.keys().next().value);
  }
  return cache.get(id);
}
