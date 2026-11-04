// Hamed's HeyGen digital-twin looks, the outfit and place an English video is rendered in. The
// workflow used to render every video in the first one whatever sample was picked (Oct 24 2026:
// a grey-suit sample came back in the white shirt), so the look is now chosen on the English video
// sheet and sent as `look_id`. A sample shows an outfit, not a look: an outfit with no look here
// cannot be rendered. Train a look of it in HeyGen (Hamed's "Hamed Sugimoto" avatar), add it to
// LOOKS, and tie the sample's Drive file to it in BENCHMARK_LOOKS.

export const LOOKS = [
  {
    id: "1298b1a92b68189770758e2b038fc9ea",
    name: ["پشت میز · پیراهن سفید، کراوات مشکی", "At the desk · white shirt, black tie"],
    picture: "https://resource2.heygen.ai/best_frame_selection/candidates/4021127eaad64914be5aa4ab4fa0a278.jpg",
  },
  {
    id: "7c72e908cc0294d40ac78a5e9fab9bf7",
    name: ["دفتر · پیراهن سفید، کراوات مشکی", "Office · white shirt, black tie"],
    picture: "https://resource2.heygen.ai/best_frame_selection/candidates/13050167153a456c9bbc349f65784597.jpg",
  },
  // Trained from the benchmark sample itself (Hamed, Nov 4 2026: "the benchmark videos are the
  // videos for Hamed's look"), so picking that sample renders him in the same suit and room.
  {
    id: "f719c06399ea744500d14ccf198441c1",
    name: ["پشت میز · کت‌وشلوار طوسی، کراوات قرمز", "At the desk · grey suit, red tie"],
    picture: "https://resource2.heygen.ai/best_frame_selection/candidates/fda341458f2e495b80c198c0f27af643.jpg",
    benchmark: "16xrNYWVPjxPM-9xLMLeSNIa3MsWAI1nA", // rough_cut_preview_v3.mp4
  },
  {
    id: "e8772d89ea904925bc630dff0671f953",
    name: ["دفتر، با دست · پیراهن سفید", "Office, hands moving · white shirt"],
    picture: "https://resource2.heygen.ai/best_frame_selection/candidates/1e4d63eaa097413bbd3f2aae81d9f79e.jpg",
  },
];

export const DEFAULT_LOOK = LOOKS[0].id;

// A sample's Drive file id -> the look trained from it. The dark pinstripe sample ("Copy of RC2
// Inland vs overseas", 1sBbvCUNvIoX7eSzaxZyI4SeLEvGpeuyy) is uploaded to HeyGen as asset
// bcc81a34af5545d884cd44cefda52bab but not trained yet: the account had no credits left (Nov 4 2026).
export const BENCHMARK_LOOKS = Object.fromEntries(LOOKS.filter((l) => l.benchmark).map((l) => [l.benchmark, l.id]));

export function isLook(id) {
  return LOOKS.some((l) => l.id === id);
}

export function driveIdOf(url) {
  const m = String(url || "").match(/\/d\/([A-Za-z0-9_-]{20,})|[?&]id=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] || m[2] : "";
}

// The look a sample is shown in, or "" when HeyGen has no look of that outfit.
export function lookForBenchmark(url) {
  const id = BENCHMARK_LOOKS[driveIdOf(url)];
  return id && isLook(id) ? id : "";
}
