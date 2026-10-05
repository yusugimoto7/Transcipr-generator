import { NextResponse } from "next/server";
import { search, getUnit, TEER, NOC_VERSION } from "../../../../lib/noc/data.js";

export const runtime = "nodejs";

// GET /api/noc/search?q=backend engineer   → ranked matches
// GET /api/noc/search?code=21231           → one full unit group profile
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (code) {
    const unit = getUnit(code);
    if (!unit) return NextResponse.json({ error: `No NOC 2021 unit group ${code}` }, { status: 404 });
    return NextResponse.json({ version: NOC_VERSION, unit, teerLabel: TEER[unit.teer] });
  }
  const results = search(searchParams.get("q") || "").map((r) => ({ ...r, teerLabel: TEER[r.teer] }));
  return NextResponse.json({ version: NOC_VERSION, results });
}
