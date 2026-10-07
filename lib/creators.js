// Creators whose posts are read as topic SIGNALS (what is being talked about,
// what the audience asks). Facts on a card still come from the post's own
// caption and are flagged as social, so a claim can be checked before use.
//
// Instagram handles, without the @. Edit freely: a handle that cannot be read
// shows up on /api/social with the reason. More can be added without a code
// change through INSTAGRAM_HANDLES (comma-separated) in Render.
//
// Starter list from public "top immigration accounts" round-ups (October 2026);
// keep the ones you actually rate, add the ones you watch.
export const INSTAGRAM_HANDLES = [
  // English — Canadian lawyers and RCICs
  "canada_immigrationlawyer",
  "mygrationimmigration",
  "icc_immigration",
  "zeste.canadaimmigration",
  "tncimmigration",
  "juliustocanada",
  // Farsi
  "yalda.ghani.immigration",
  "visamondial",
  "mansouri_immigration",
  "canadapass",
  "trustimms",
  "raahjoo.official",
  "icpimmigrationtocanada",
  "atlantic.724",
];
