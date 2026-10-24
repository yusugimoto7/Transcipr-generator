// The company logo burned into pictures: the transparent PNG with dark letters on a light
// background, the one with white letters on a dark one, never a white plate behind it (Hamed,
// Oct 2026: "no background behind the logo; white or dark letters by what is under it").

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "public", "brand");
const files = { light: "logo-on-light.png", dark: "logo-on-dark.png" };
const cache = {};

// Mean brightness (0-255) of a part of a picture.
export async function brightness(buffer, { left, top, width, height }) {
  const { width: W, height: H } = await sharp(buffer).metadata();
  const x = Math.max(0, Math.min(W - 1, Math.round(left)));
  const y = Math.max(0, Math.min(H - 1, Math.round(top)));
  const w = Math.max(1, Math.min(W - x, Math.round(width)));
  const h = Math.max(1, Math.min(H - y, Math.round(height)));
  const { channels } = await sharp(buffer).extract({ left: x, top: y, width: w, height: h }).greyscale().stats();
  return channels[0].mean;
}

// The logo file that reads on a background of this brightness.
export async function logoFor(luma) {
  const k = luma >= 150 ? "light" : "dark";
  if (!cache[k]) cache[k] = await fs.readFile(path.join(DIR, files[k]));
  return cache[k];
}
