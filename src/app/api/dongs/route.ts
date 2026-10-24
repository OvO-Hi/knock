import { getData, parseFlags } from "@/lib/data";
import { parseReason } from "@/lib/reason";
import type { DongsResponse } from "@/lib/api-types";

export const dynamic = "force-static";

export function GET() {
  const { dongs, clusterProfiles, subtypeByCode } = getData();
  const body: DongsResponse = {
    dongs: dongs.map((d) => {
      const s = subtypeByCode.get(d.EMD_CD);
      return {
        ...d,
        reasons: [parseReason(d.REASON_1), parseReason(d.REASON_2)],
        subtype: s ? { SUBTYPE_ID: s.SUBTYPE_ID, SUBTYPE_NM: s.SUBTYPE_NM, FLAGS: parseFlags(s.FLAG), NOTE: s.NOTE } : null,
      };
    }),
    profiles: clusterProfiles,
  };
  return Response.json(body);
}
