import { getData } from "@/lib/data";
import { parseReason } from "@/lib/reason";
import type { DongsResponse } from "@/lib/api-types";

export const dynamic = "force-static";

export function GET() {
  const { dongs, clusterProfiles } = getData();
  const body: DongsResponse = {
    dongs: dongs.map((d) => ({ ...d, reasons: [parseReason(d.REASON_1), parseReason(d.REASON_2)] })),
    profiles: clusterProfiles,
  };
  return Response.json(body);
}
