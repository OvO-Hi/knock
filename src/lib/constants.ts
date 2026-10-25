// 클라이언트·서버 공용 상수 (fs 의존 없음)
export const GROUPS = ["HH1", "HH2", "HL", "LH", "LL"] as const;
export type Group = (typeof GROUPS)[number];

export const LEVELS = [5, 4, 3, 2, 1] as const;
export type RiskLevel = 1 | 2 | 3 | 4 | 5;

export const VARIABLES = [
  "HH1_EXPO_5060",
  "MALE_SHARE_5060",
  "VISIBLE_IDX_50P",
  "TIME_ENTROPY",
  "POP_DENSITY",
] as const;
export type VariableCode = (typeof VARIABLES)[number];

/** dong_subtype.csv FLAG 값 (";" 로 여러 개) */
export const FLAGS = ["탐색지구", "관찰지구", "경계"] as const;
export type Flag = (typeof FLAGS)[number];

export const parseFlags = (s: string): Flag[] =>
  s
    .split(";")
    .map((x) => x.trim())
    .filter((x): x is Flag => (FLAGS as readonly string[]).includes(x));

/** 위험도 단계 색: 지도·리스트·패널 배지·필터 칩·범례·가이드 공통 (단일 원본) */
export const LEVEL_COLOR: Record<RiskLevel, string> = {
  5: "#c0392b",
  4: "#e67e22",
  3: "#f1c40f",
  2: "#85c1e9",
  1: "#2e86c1",
};

/** 단계 색 위 글자색: 밝은 배경(5단계 제외)은 검정, 4단계 주황도 검정 글씨 */
export const LEVEL_TEXT: Record<RiskLevel, string> = {
  5: "#fff",
  4: "#111",
  3: "#111",
  2: "#111",
  1: "#fff",
};
