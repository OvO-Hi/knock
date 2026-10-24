// 모델 결과 데이터 로더 (CLAUDE.md §3.1).
// /data 의 CSV 5종 + variable_dictionary.md 를 서버에서 1회 읽어 모듈 싱글톤으로 둔다.
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

export const GROUPS = ["HH1", "HH2", "HL", "LH", "LL"] as const;
export type Group = (typeof GROUPS)[number];
export type RiskLevel = 1 | 2 | 3 | 4 | 5;
/** *_Q 단계점수 (시군구 안 5분위, 5 = 위험) */
export type Quintile = 1 | 2 | 3 | 4 | 5;

export const VARIABLES = [
  "HH1_EXPO_5060",
  "MALE_SHARE_5060",
  "VISIBLE_IDX_50P",
  "TIME_ENTROPY",
  "POP_DENSITY",
] as const;
export type VariableCode = (typeof VARIABLES)[number];

export interface DongRow {
  EMD_CD: string;
  SGG_CD: string;
  SGG_NM: string;
  EMD_NM: string;
  AREA_KM2: number;
  TOT_POP_CNT: number;
  POP_5060: number;
  HH1_EXPO_5060: number;
  MALE_SHARE_5060: number;
  VISIBLE_IDX_50P: number;
  TIME_ENTROPY: number;
  POP_DENSITY: number;
  HH1_EXPO_5060_Q: Quintile;
  MALE_SHARE_5060_Q: Quintile;
  VISIBLE_IDX_50P_Q: Quintile;
  TIME_ENTROPY_Q: Quintile;
  POP_DENSITY_Q: Quintile;
  POP_SCORE: number;
  REG_SCORE: number;
  TOTAL_SCORE: number;
  GROUP: Group;
  RISK_LEVEL: RiskLevel;
  P_OWN: number;
  REASON_1: string;
  REASON_2: string;
}

export interface ClusterProfile {
  GROUP: Group;
  N_DONG: number;
  HH1_EXPO_5060: number;
  MALE_SHARE_5060: number;
  VISIBLE_IDX_50P: number;
  TIME_ENTROPY: number;
  POP_DENSITY: number;
  /** 군집 평균이므로 소수 */
  HH1_EXPO_5060_Q: number;
  MALE_SHARE_5060_Q: number;
  VISIBLE_IDX_50P_Q: number;
  TIME_ENTROPY_Q: number;
  POP_DENSITY_Q: number;
  POP_SCORE: number;
  REG_SCORE: number;
  TOT_POP_CNT: number;
  POP_5060: number;
}

export interface ValidationSummary {
  모델: string;
  입력공간: string;
  알고리즘: string;
  K: number;
  "동 수": number;
  "군집 구성": string;
  "실루엣 계수": number;
  "Davies-Bouldin 지수": number;
  "부트스트랩 안정성 ARI (100회)": number;
  "최소 군집 크기": number;
  "기본 모델(2D 단계점수 K-means K=4)과 ARI": number;
  "대리모델 RF 정확도 (반복 5-fold×20)": number;
  "대리모델 RF 정확도 표준편차": number;
  "대리모델 RF 학습 정확도": number;
}

export interface SensitivityRow {
  방식: string;
  "종합점수 순위상관": number;
  "군집 일치(ARI)": number;
  "상위 10개 동 일치": number;
}

export interface ShapRow {
  변수코드: VariableCode;
  변수명: string;
  HH1: number;
  HH2: number;
  HL: number;
  LH: number;
  LL: number;
  합계: number;
}

export interface KnockData {
  dongs: DongRow[];
  dongByCode: Map<string, DongRow>;
  clusterProfiles: ClusterProfile[];
  validation: ValidationSummary;
  sensitivity: SensitivityRow[];
  shap: ShapRow[];
  variableDictionary: string;
}

export const DONG_COLUMNS = [
  "EMD_CD", "SGG_CD", "SGG_NM", "EMD_NM", "AREA_KM2", "TOT_POP_CNT", "POP_5060",
  "HH1_EXPO_5060", "MALE_SHARE_5060", "VISIBLE_IDX_50P", "TIME_ENTROPY", "POP_DENSITY",
  "HH1_EXPO_5060_Q", "MALE_SHARE_5060_Q", "VISIBLE_IDX_50P_Q", "TIME_ENTROPY_Q", "POP_DENSITY_Q",
  "POP_SCORE", "REG_SCORE", "TOTAL_SCORE", "GROUP", "RISK_LEVEL", "P_OWN", "REASON_1", "REASON_2",
] as const satisfies readonly (keyof DongRow)[];

const DONG_STRING_COLUMNS = new Set(["EMD_CD", "SGG_CD", "SGG_NM", "EMD_NM", "GROUP", "REASON_1", "REASON_2"]);

type Raw = Record<string, string>;

export function readCsv(file: string): { rows: Raw[]; fields: string[] } {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const res = Papa.parse<Raw>(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  if (res.errors.length) {
    throw new Error(`${path.basename(file)} 파싱 오류: ${res.errors.map((e) => e.message).join("; ")}`);
  }
  return { rows: res.data, fields: res.meta.fields ?? [] };
}

function num(v: string | undefined, col: string, file: string): number {
  const n = Number(v);
  if (v === undefined || v.trim() === "" || !Number.isFinite(n)) {
    throw new Error(`${file}: ${col} 숫자 아님 (${JSON.stringify(v)})`);
  }
  return n;
}

/** stringCols 외 컬럼은 전부 number 로 변환 */
function typed<T>(rows: Raw[], stringCols: Set<string>, file: string): T[] {
  return rows.map((r) => {
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(r)) out[k] = stringCols.has(k) ? v.trim() : num(v, k, file);
    return out as T;
  });
}

function assertGroup(v: string, file: string): Group {
  if (!(GROUPS as readonly string[]).includes(v)) throw new Error(`${file}: GROUP 값 오류 (${v})`);
  return v as Group;
}

function assertLevel(v: number, col: string, file: string): RiskLevel {
  if (!Number.isInteger(v) || v < 1 || v > 5) throw new Error(`${file}: ${col} 1~5 아님 (${v})`);
  return v as RiskLevel;
}

export function loadData(dataDir = path.join(process.cwd(), "data")): KnockData {
  const p = (f: string) => path.join(dataDir, f);

  const dongs = typed<DongRow>(readCsv(p("dong_cluster.csv")).rows, DONG_STRING_COLUMNS, "dong_cluster.csv");
  for (const d of dongs) {
    assertGroup(d.GROUP, "dong_cluster.csv");
    assertLevel(d.RISK_LEVEL, "RISK_LEVEL", "dong_cluster.csv");
    for (const v of VARIABLES) assertLevel(d[`${v}_Q`], `${v}_Q`, "dong_cluster.csv");
  }

  const clusterProfiles = typed<ClusterProfile>(
    readCsv(p("cluster_profile.csv")).rows, new Set(["GROUP"]), "cluster_profile.csv",
  );
  clusterProfiles.forEach((c) => assertGroup(c.GROUP, "cluster_profile.csv"));

  const [validation] = typed<ValidationSummary>(
    readCsv(p("validation_summary.csv")).rows, new Set(["모델", "입력공간", "알고리즘", "군집 구성"]),
    "validation_summary.csv",
  );

  const sensitivity = typed<SensitivityRow>(
    readCsv(p("sensitivity_final.csv")).rows, new Set(["방식"]), "sensitivity_final.csv",
  );

  const shap = typed<ShapRow>(
    readCsv(p("shap_importance.csv")).rows, new Set(["변수코드", "변수명"]), "shap_importance.csv",
  );

  const variableDictionary = fs.readFileSync(p("variable_dictionary.md"), "utf8").replace(/^﻿/, "");

  return {
    dongs,
    dongByCode: new Map(dongs.map((d) => [d.EMD_CD, d])),
    clusterProfiles,
    validation,
    sensitivity,
    shap,
    variableDictionary,
  };
}

// dev 서버 HMR 에서도 재로딩하지 않도록 globalThis 에 보관
const g = globalThis as typeof globalThis & { __knockData?: KnockData };

export function getData(): KnockData {
  if (!g.__knockData) g.__knockData = loadData();
  return g.__knockData;
}
