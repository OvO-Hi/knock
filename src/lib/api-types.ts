// /api/* 응답 형태 (클라이언트·서버 공용)
import type { Flag } from "./constants";
import type { ClusterProfile, DongRow, InterventionRule, LevelPolicy, WelfareResource } from "./data";
import type { Reason } from "./reason";

export interface DongSubtypeInfo {
  SUBTYPE_ID: string;
  SUBTYPE_NM: string;
  FLAGS: Flag[];
  NOTE: string;
}

export interface DongDTO extends DongRow {
  /** [REASON_1, REASON_2] 파싱 결과 (실패 시 null) */
  reasons: [Reason | null, Reason | null];
  /** dong_subtype.csv (없으면 null) */
  subtype: DongSubtypeInfo | null;
}

export interface DongsResponse {
  dongs: DongDTO[];
  profiles: ClusterProfile[];
}

export interface RulesResponse {
  rules: InterventionRule[];
  levelPolicy: LevelPolicy[];
}

export interface ResourcesResponse {
  resources: WelfareResource[];
}

export interface EmdFeatureProps {
  EMD_CD: string;
  EMD_NM: string;
  SGG_CD: string;
  SGG_NM: string;
}
