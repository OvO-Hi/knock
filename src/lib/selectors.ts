// 필터·우선순위 계산 (클라이언트 공용)
import type { DongDTO } from "./api-types";
import type { Group, RiskLevel } from "./constants";
import type { Region } from "./labels";

export interface Filters {
  region: Region;
  levels: Set<RiskLevel>;
  groups: Set<Group>;
}

export const matchesFilter = (d: DongDTO, f: Filters) =>
  (f.region === "all" || d.SGG_CD === f.region) && f.levels.has(d.RISK_LEVEL) && f.groups.has(d.GROUP);

/** 모델 우선순위 규칙: 단계↓ → 5060 인구↓ */
export const byPriority = (a: DongDTO, b: DongDTO) => b.RISK_LEVEL - a.RISK_LEVEL || b.POP_5060 - a.POP_5060;

/** 필터 통과 동 중 우선순위 상위 n 의 EMD_CD */
export function topN(dongs: DongDTO[], f: Filters, n: number): Set<string> {
  return new Set(dongs.filter((d) => matchesFilter(d, f)).sort(byPriority).slice(0, n).map((d) => d.EMD_CD));
}
