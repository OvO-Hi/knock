// /api/dongs 응답 형태 (클라이언트·서버 공용)
import type { ClusterProfile, DongRow } from "./data";
import type { Reason } from "./reason";

export interface DongDTO extends DongRow {
  /** [REASON_1, REASON_2] 파싱 결과 (실패 시 null) */
  reasons: [Reason | null, Reason | null];
}

export interface DongsResponse {
  dongs: DongDTO[];
  profiles: ClusterProfile[];
}

export interface EmdFeatureProps {
  EMD_CD: string;
  EMD_NM: string;
  SGG_CD: string;
  SGG_NM: string;
}
