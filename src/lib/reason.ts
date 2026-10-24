// REASON_1/2 파서 (CLAUDE.md §3.1). 예: "2-1 생활 리듬 (위험 쪽, +0.24)"
export interface Reason {
  /** 변수 라벨, 예: "2-1 생활 리듬" */
  label: string;
  side: "위험" | "안전";
  /** SHAP 값 (부호 포함) */
  shap: number;
}

export const REASON_RE = /^(\S+ .+?) \((위험|안전) 쪽, ([+-]\d+\.\d+)\)$/;

export function parseReason(s: string): Reason | null {
  const m = REASON_RE.exec(s.trim());
  if (!m) return null;
  return { label: m[1], side: m[2] as Reason["side"], shap: Number(m[3]) };
}
