import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

export function GET() {
  const text = fs.readFileSync(path.join(process.cwd(), "data", "gangnam_chuncheon_emd.geojson"), "utf8");
  return new Response(text, { headers: { "Content-Type": "application/geo+json; charset=utf-8" } });
}
