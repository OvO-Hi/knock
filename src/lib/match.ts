// 동 ↔ 복지자원 매칭 규칙 (CLAUDE.md §4.3, 패널·에이전트 도구 공통). fs 의존 없음.
import type { Group } from "./constants";
import type { WelfareResource } from "./data";

export interface MatchDong {
  EMD_CD: string;
  SGG_CD: string;
  GROUP: Group;
}

export interface ResourceMatch {
  /** 1) EMD_CD 가 이 동인 사업: 항상 표시, 맨 위 */
  own: WelfareResource[];
  /** 2) EMD_CD 빈칸 + SGG_CD 일치 + (GROUP 포함 or ALL) */
  general: WelfareResource[];
  /** 3) 다른 동 사업 + SGG_CD 일치 + GROUP 매칭: "다른 동 사례(확산 가능)" */
  otherDongs: WelfareResource[];
}

export const groupsMatch = (r: WelfareResource, g: Group) => {
  const gs = r.MATCH_GROUPS.split(";").map((x) => x.trim());
  return gs.includes("ALL") || gs.includes(g);
};

export function matchResources(d: MatchDong, resources: WelfareResource[]): ResourceMatch {
  const out: ResourceMatch = { own: [], general: [], otherDongs: [] };
  for (const r of resources) {
    if (r.EMD_CD === d.EMD_CD) out.own.push(r);
    else if (r.SGG_CD !== d.SGG_CD || !groupsMatch(r, d.GROUP)) continue;
    else if (r.EMD_CD === "") out.general.push(r);
    else out.otherDongs.push(r);
  }
  return out;
}
