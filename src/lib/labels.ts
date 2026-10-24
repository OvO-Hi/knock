// 화면 표기용 라벨·색 (CLAUDE.md §4.2·4.3)
import type { Flag, Group, RiskLevel } from "./constants";

export type Region = "all" | "11230" | "32010";

export const REGION_LABEL: Record<Region, string> = {
  all: "전체",
  "11230": "강남구",
  "32010": "춘천시",
};

export const PRIORITY_LABEL: Record<RiskLevel, string> = {
  5: "최우선",
  4: "우선",
  3: "관찰",
  2: "예방",
  1: "모니터링",
};

export const GROUP_NAME: Record<Group, string> = {
  HH1: "극고위험",
  HH2: "고위험",
  HL: "군중 속 고립",
  LH: "활동적 주거지",
  LL: "저위험",
};

export const GROUP_DESC: Record<Group, string> = {
  HH1: "사람·동네 모두 취약",
  HH2: "동네 요인 중심",
  HL: "사람은 취약, 동네는 붐빔",
  LH: "사람은 안전, 동네 환경 주의",
  LL: "고밀 아파트 단지",
};

export const LEVEL_COLOR: Record<RiskLevel, string> = {
  5: "#c0392b",
  4: "#e67e22",
  3: "#f1c40f",
  2: "#85c1e9",
  1: "#2e86c1",
};

export const GROUP_COLOR: Record<Group, string> = {
  HH1: "#8e1b1b",
  HH2: "#d35400",
  HL: "#b9770e",
  LH: "#1f618d",
  LL: "#7f8c8d",
};

/** 밝은 배경색 위 글자는 검정 */
export const textOn = (bg: string) => (["#f1c40f", "#85c1e9", "#e67e22"].includes(bg) ? "#111" : "#fff");

/** 춘천 '강남동'을 서울 '강남구'와 헷갈리지 않게 표기 */
export function displayName(d: { EMD_NM: string; SGG_CD: string }): string {
  return d.SGG_CD === "32010" && d.EMD_NM === "강남동" ? "강남동(춘천)" : d.EMD_NM;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("ko-KR");

export const FLAG_COLOR: Record<Flag, string> = {
  탐색지구: "#7d3c98",
  관찰지구: "#7f8c8d",
  경계: "#e67e22",
};
