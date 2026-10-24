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
