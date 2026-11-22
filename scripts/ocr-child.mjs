// OCR in a process of its own (lib/visa-news/scan.js ocrWords): the engine and its English model take
// about 140 MB, and inside the server that memory never fully went back to the system. Here it is gone
// when the picture is read. A PNG/JPEG comes in on stdin; tesseract's blocks go out as JSON on stdout.
import os from "node:os";
import { createWorker } from "tesseract.js";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const w = await createWorker("eng", 1, { cachePath: os.tmpdir() });
try {
  const { data } = await w.recognize(Buffer.concat(chunks), {}, { blocks: true });
  const slim = (data.blocks || []).map((b) => ({
    bbox: b.bbox,
    paragraphs: (b.paragraphs || []).map((p) => ({
      bbox: p.bbox,
      lines: (p.lines || []).map((l) => ({ words: (l.words || []).map((x) => ({ text: x.text, bbox: x.bbox })) })),
    })),
  }));
  process.stdout.write(JSON.stringify({ blocks: slim }));
} finally {
  await w.terminate().catch(() => {});
}
