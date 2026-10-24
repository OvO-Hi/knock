// 에이전트 도구 10종 (CLAUDE.md §4.6). 메모리 데이터(lib/data.ts)를 조회·필터·정렬만 하고 새 수치를 계산하지 않는다.
// 각 도구는 { data, sources } 를 반환하고, sources 에 사용한 파일·컬럼을 적는다.
import type Anthropic from "@anthropic-ai/sdk";
import { GROUPS, LEVELS, VARIABLES, type Group, type RiskLevel, type VariableCode } from "./constants";
import { getData, parseFlags, type ClusterProfile, type DongRow, type KnockData } from "./data";
import { GROUP_DESC, GROUP_NAME, PRIORITY_LABEL, displayName } from "./labels";
import { groupsMatch, matchResources } from "./match";
import { parseReason } from "./reason";
import { VARIABLE_META } from "./variables";

export interface ToolResult<T = unknown> {
  data: T;
  sources: string[];
}

/** 인자 오류·조회 실패. tool_result 에 is_error 로 돌려준다 */
export class ToolError extends Error {}

type Region = "11230" | "32010";
const REGION_NM: Record<Region, string> = { "11230": "강남구", "32010": "춘천시" };

// ---------------------------------------------------------------- 이름·인자 해석

/** "강남구"/"강남"/"11230" → 11230, "춘천"/"춘천시"/"32010" → 32010, 전체/빈값 → undefined */
export function parseRegion(v: unknown): Region | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).replace(/\s/g, "");
  if (["all", "전체", "모두"].includes(s)) return undefined;
  if (["11230", "강남구", "강남", "서울강남구", "서울"].includes(s)) return "11230";
  if (["32010", "춘천시", "춘천"].includes(s)) return "32010";
  throw new ToolError(`알 수 없는 지역: ${v} (강남구 | 춘천시 | 전체)`);
}

/** 동 이름 비교용 정규화: "(춘천)" 꼬리, "춘천 "·"강남 " 접두, 공백 제거 */
function normalizeName(raw: string): { name: string; region?: Region } {
  let s = raw.trim();
  let region: Region | undefined;
  if (/춘천/.test(s)) region = "32010";
  if (/강남구/.test(s) || /^(서울\s*)?강남\s+/.test(s) || /\(강남\)/.test(s)) region = "11230";
  s = s
    .replace(/\((춘천|춘천시|강남|강남구)\)/g, "")
    .replace(/^(서울(특별시)?\s*)?(강원(특별자치도|도)?\s*)?/, "")
    .replace(/^(춘천시|춘천|강남구|강남)\s+/, "")
    .replace(/\s/g, "");
  return { name: s, region };
}

/** EMD_CD(8자리) 또는 동 이름 → 동 행. '강남동' = 춘천 강남동, '강남구' 는 지역이라 오류 */
export function resolveDong(idOrName: unknown, regionArg?: unknown, d: KnockData = getData()): DongRow {
  const raw = String(idOrName ?? "").trim();
  if (!raw) throw new ToolError("동 코드(emd_cd) 또는 동 이름이 필요합니다");
  if (/^\d{8}$/.test(raw)) {
    const hit = d.dongByCode.get(raw);
    if (!hit) throw new ToolError(`결과표에 없는 동 코드: ${raw}`);
    return hit;
  }
  if (/^(서울\s*)?강남구$|^춘천시?$/.test(raw.replace(/\s/g, ""))) {
    throw new ToolError(`'${raw}'는 동이 아니라 지역입니다. region 인자로 지정하세요`);
  }
  const { name, region: hinted } = normalizeName(raw);
  const region = parseRegion(regionArg) ?? hinted;
  let hits = d.dongs.filter((x) => x.EMD_NM === name && (!region || x.SGG_CD === region));
  if (!hits.length && !name.endsWith("동") && !name.endsWith("면") && !name.endsWith("읍")) {
    hits = d.dongs.filter((x) => x.EMD_NM === `${name}동` && (!region || x.SGG_CD === region));
  }
  if (!hits.length) throw new ToolError(`결과표에 없는 동 이름: ${raw}`);
  if (hits.length > 1) {
    throw new ToolError(`'${raw}'가 여러 지역에 있습니다: ${hits.map((h) => `${h.EMD_NM}(${h.SGG_NM})`).join(", ")}. region을 지정하세요`);
  }
  return hits[0];
}

const asArray = <T,>(v: unknown): T[] | undefined =>
  v === undefined || v === null ? undefined : Array.isArray(v) ? (v as T[]) : [v as T];

function parseLevels(v: unknown): RiskLevel[] | undefined {
  const xs = asArray<unknown>(v)?.map(Number);
  if (!xs) return undefined;
  if (xs.some((x) => !(LEVELS as readonly number[]).includes(x))) throw new ToolError(`levels 는 1~5: ${v}`);
  return xs as RiskLevel[];
}

function parseGroups(v: unknown): Group[] | undefined {
  const xs = asArray<unknown>(v)?.map((x) => String(x).toUpperCase());
  if (!xs) return undefined;
  if (xs.some((x) => !(GROUPS as readonly string[]).includes(x))) throw new ToolError(`groups 는 HH1|HH2|HL|LH|LL: ${v}`);
  return xs as Group[];
}

type AdminType = "읍면" | "동";
function parseAdminType(v: unknown): AdminType | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (v === "읍면" || v === "동") return v;
  throw new ToolError(`admin_type 은 '읍면' | '동': ${v}`);
}
const isEupMyeon = (d: DongRow) => /[읍면]$/.test(d.EMD_NM);

// ---------------------------------------------------------------- 공통 조각

/** 모델 우선순위 규칙: 단계↓ → 5060 인구↓ */
const byPriority = (a: DongRow, b: DongRow) => b.RISK_LEVEL - a.RISK_LEVEL || b.POP_5060 - a.POP_5060;

function summary(d: DongRow, k: KnockData) {
  const s = k.subtypeByCode.get(d.EMD_CD);
  return {
    EMD_CD: d.EMD_CD,
    이름: displayName(d),
    지역: d.SGG_NM,
    RISK_LEVEL: d.RISK_LEVEL,
    PRIORITY_LABEL: PRIORITY_LABEL[d.RISK_LEVEL],
    GROUP: d.GROUP,
    SUBTYPE_NM: s?.SUBTYPE_NM ?? null,
    TOTAL_SCORE: d.TOTAL_SCORE,
    POP_5060: d.POP_5060,
    FLAGS: parseFlags(s?.FLAG ?? ""),
  };
}

const SUMMARY_SOURCES = [
  "dong_cluster.csv(EMD_CD, EMD_NM, SGG_NM, RISK_LEVEL, GROUP, TOTAL_SCORE, POP_5060)",
  "dong_subtype.csv(SUBTYPE_NM, FLAG)",
];

function flagInfo(d: DongRow, k: KnockData) {
  const s = k.subtypeByCode.get(d.EMD_CD);
  return {
    SUBTYPE_ID: s?.SUBTYPE_ID ?? null,
    SUBTYPE_NM: s?.SUBTYPE_NM ?? null,
    FLAGS: parseFlags(s?.FLAG ?? ""),
    NOTE: s?.NOTE || null,
  };
}

const profileOf = (g: Group, k: KnockData): ClusterProfile | undefined => k.clusterProfiles.find((c) => c.GROUP === g);

// ---------------------------------------------------------------- 도구 구현

function list_dongs(input: Record<string, unknown>): ToolResult {
  const k = getData();
  const region = parseRegion(input.region);
  const levels = parseLevels(input.levels);
  const groups = parseGroups(input.groups);
  const adminType = parseAdminType(input.admin_type);
  const sort = (input.sort as string) ?? "level_pop";
  const limit = input.limit === undefined ? undefined : Math.max(1, Number(input.limit));

  const cmp: Record<string, (a: DongRow, b: DongRow) => number> = {
    level_pop: byPriority,
    total: (a, b) => b.TOTAL_SCORE - a.TOTAL_SCORE || byPriority(a, b),
    pop5060: (a, b) => b.POP_5060 - a.POP_5060,
  };
  if (!cmp[sort]) throw new ToolError(`sort 는 level_pop | total | pop5060: ${sort}`);

  const rows = k.dongs
    .filter(
      (d) =>
        (!region || d.SGG_CD === region) &&
        (!levels || levels.includes(d.RISK_LEVEL)) &&
        (!groups || groups.includes(d.GROUP)) &&
        (!adminType || (adminType === "읍면") === isEupMyeon(d)),
    )
    .sort(cmp[sort]);
  return {
    data: { 조건: { region: region ? REGION_NM[region] : "전체", levels, groups, admin_type: adminType, sort }, 전체_건수: rows.length, 동: rows.slice(0, limit).map((d) => summary(d, k)) },
    sources: SUMMARY_SOURCES,
  };
}

function get_dong(input: Record<string, unknown>): ToolResult {
  const k = getData();
  const d = resolveDong(input.emd_cd ?? input.name, input.region, k);
  const p = profileOf(d.GROUP, k);
  return {
    data: {
      ...d,
      이름: displayName(d),
      PRIORITY_LABEL: PRIORITY_LABEL[d.RISK_LEVEL],
      군집_설명: `${GROUP_NAME[d.GROUP]}: ${GROUP_DESC[d.GROUP]}`,
      경계_동: d.P_OWN < 0.5,
      ...flagInfo(d, k),
      REASONS: [parseReason(d.REASON_1), parseReason(d.REASON_2)],
      // 군집 평균은 나란히 보여줄 뿐 차이를 계산하지 않는다
      군집_평균: p
        ? {
            N_DONG: p.N_DONG,
            ...Object.fromEntries(VARIABLES.map((v) => [`${v}_Q`, { 이_동: d[`${v}_Q`], 군집_평균: p[`${v}_Q`] }])),
            POP_SCORE: { 이_동: d.POP_SCORE, 군집_평균: p.POP_SCORE },
            REG_SCORE: { 이_동: d.REG_SCORE, 군집_평균: p.REG_SCORE },
          }
        : null,
    },
    sources: [
      "dong_cluster.csv(전체 컬럼)",
      "dong_subtype.csv(SUBTYPE_NM, FLAG, NOTE)",
      `cluster_profile.csv(${d.GROUP})`,
    ],
  };
}

function explain_dong(input: Record<string, unknown>): ToolResult {
  const k = getData();
  const d = resolveDong(input.emd_cd ?? input.name, input.region, k);
  const peers = k.dongs.filter((x) => x.SGG_CD === d.SGG_CD);
  const reasons = [parseReason(d.REASON_1), parseReason(d.REASON_2)];

  const variables = VARIABLE_META.map((m) => {
    // 시군구 안 위험 순위: 위험 방향으로 정렬했을 때 몇 번째인지 (1 = 가장 위험)
    const sorted = [...peers].sort((a, b) => (m.lowIsRisk ? a[m.code] - b[m.code] : b[m.code] - a[m.code]));
    const rank = sorted.findIndex((x) => x.EMD_CD === d.EMD_CD) + 1;
    const reason = reasons.find((r) => r && labelToCode(r.label) === m.code) ?? null;
    return {
      변수코드: m.code,
      이름: m.label,
      축: m.axis,
      원값: d[m.code],
      원값_표기: m.format(d[m.code]),
      단계점수: d[`${m.code}_Q`],
      시군구_내_위험순위: `${rank}/${peers.length}`,
      위험_방향: m.lowIsRisk ? "값이 낮을수록 위험" : "값이 높을수록 위험",
      쉬운_말: m.plain,
      계산식: m.formula,
      SHAP_판별근거: reason ? { side: reason.side, shap: reason.shap } : null,
    };
  });

  return {
    data: { EMD_CD: d.EMD_CD, 이름: displayName(d), 지역: d.SGG_NM, RISK_LEVEL: d.RISK_LEVEL, GROUP: d.GROUP, POP_SCORE: d.POP_SCORE, REG_SCORE: d.REG_SCORE, TOTAL_SCORE: d.TOTAL_SCORE, 변수: variables },
    sources: [
      `dong_cluster.csv(${VARIABLES.join(", ")}, *_Q, REASON_1, REASON_2)`,
      "variable_dictionary.md(계산식, 위험 방향, 쉬운 말)",
    ],
  };
}

/** REASON 라벨("2-1 생활 리듬") → 변수코드 (shap_importance.csv 의 변수명으로 매핑) */
function labelToCode(label: string): VariableCode | undefined {
  return getData().shap.find((s) => s.변수명 === label)?.변수코드;
}

function compare_dongs(input: Record<string, unknown>): ToolResult {
  const k = getData();
  const ids = asArray<unknown>(input.emd_cds) ?? [];
  if (ids.length < 2 || ids.length > 5) throw new ToolError("emd_cds 는 2~5개");
  const ds = ids.map((x) => resolveDong(x, undefined, k));
  return {
    data: ds.map((d) => ({
      ...summary(d, k),
      POP_SCORE: d.POP_SCORE,
      REG_SCORE: d.REG_SCORE,
      ...Object.fromEntries(VARIABLES.flatMap((v) => [[v, d[v]], [`${v}_Q`, d[`${v}_Q`]]])),
      REASON_1: d.REASON_1,
      REASON_2: d.REASON_2,
    })),
    sources: ["dong_cluster.csv(변수 5개 원값·*_Q, POP_SCORE, REG_SCORE, TOTAL_SCORE, REASON_1·2)", ...SUMMARY_SOURCES.slice(1)],
  };
}

function get_cluster_profile(input: Record<string, unknown>): ToolResult {
  const k = getData();
  const groups = parseGroups(input.group) ?? [...GROUPS];
  return {
    data: groups.map((g) => ({
      ...profileOf(g, k),
      이름: GROUP_NAME[g],
      한줄_설명: GROUP_DESC[g],
      소속_동: k.dongs
        .filter((d) => d.GROUP === g)
        .sort(byPriority)
        .map((d) => ({ EMD_CD: d.EMD_CD, 이름: displayName(d), 지역: d.SGG_NM, RISK_LEVEL: d.RISK_LEVEL })),
    })),
    sources: ["cluster_profile.csv(전체 컬럼)", "dong_cluster.csv(GROUP, RISK_LEVEL)"],
  };
}

function recommend_actions(input: Record<string, unknown>): ToolResult {
  const k = getData();
  const d = resolveDong(input.emd_cd ?? input.name, input.region, k);
  const f = flagInfo(d, k);
  const rule = k.rules.find((r) => r.SUBTYPE_ID === f.SUBTYPE_ID) ?? null;
  const policy = k.levelPolicy.find((l) => l.RISK_LEVEL === d.RISK_LEVEL) ?? null;
  return {
    data: { EMD_CD: d.EMD_CD, 이름: displayName(d), RISK_LEVEL: d.RISK_LEVEL, GROUP: d.GROUP, ...f, 대응_규칙: rule, 운영_주기: policy },
    sources: [
      `intervention_rules.csv(${f.SUBTYPE_ID ?? "-"})`,
      `level_policy.csv(RISK_LEVEL=${d.RISK_LEVEL})`,
      "dong_subtype.csv(SUBTYPE_ID, FLAG, NOTE)",
    ],
  };
}

function get_resources(input: Record<string, unknown>): ToolResult {
  const k = getData();
  const type = input.type ? String(input.type) : undefined;
  const byType = <T extends { TYPE: string }>(xs: T[]) => (type ? xs.filter((r) => r.TYPE === type) : xs);

  if (input.emd_cd) {
    const d = resolveDong(input.emd_cd, input.region, k);
    const m = matchResources(d, k.resources);
    return {
      data: { EMD_CD: d.EMD_CD, 이름: displayName(d), 이_동_사업: byType(m.own), 연결_가능: byType(m.general), 다른_동_사례: byType(m.otherDongs) },
      sources: ["welfare_resources.csv(SGG_CD, EMD_CD, MATCH_GROUPS)", "dong_cluster.csv(GROUP)"],
    };
  }
  const region = parseRegion(input.region);
  const group = parseGroups(input.group)?.[0];
  const rows = byType(
    k.resources.filter((r) => (!region || r.SGG_CD === region) && (!group || groupsMatch(r, group))),
  );
  return {
    data: { 조건: { region: region ? REGION_NM[region] : "전체", group, type }, 자원: rows },
    sources: ["welfare_resources.csv(SGG_CD, MATCH_GROUPS, TYPE)"],
  };
}

function prioritize(input: Record<string, unknown>): ToolResult {
  const k = getData();
  const region = parseRegion(input.region);
  const n = Math.max(1, Math.min(47, Number(input.n ?? 10)));
  const c = (input.constraints ?? {}) as Record<string, unknown>;
  const excludeFlags = (asArray<string>(c.exclude_flags) ?? []).map(String);
  const groups = parseGroups(c.groups);
  const adminType = parseAdminType(c.admin_type);

  const pool = k.dongs
    .filter((d) => {
      const flags = parseFlags(k.subtypeByCode.get(d.EMD_CD)?.FLAG ?? "");
      return (
        (!region || d.SGG_CD === region) &&
        (!groups || groups.includes(d.GROUP)) &&
        (!adminType || (adminType === "읍면") === isEupMyeon(d)) &&
        !flags.some((f) => excludeFlags.includes(f))
      );
    })
    .sort(byPriority);

  return {
    data: {
      규칙: "위험도 단계 내림차순 → 같은 단계 안에서 50·60대 인구 내림차순",
      조건: { region: region ? REGION_NM[region] : "전체", n, exclude_flags: excludeFlags, groups, admin_type: adminType },
      후보_수: pool.length,
      우선_동: pool.slice(0, n).map((d, i) => {
        const s = summary(d, k);
        return {
          순서: i + 1,
          ...s,
          선정_이유: `${d.RISK_LEVEL}단계(${PRIORITY_LABEL[d.RISK_LEVEL]}) · 50·60대 ${d.POP_5060.toLocaleString("ko-KR")}명 · ${d.GROUP} ${GROUP_NAME[d.GROUP]}${s.SUBTYPE_NM ? `(${s.SUBTYPE_NM})` : ""}`,
        };
      }),
    },
    sources: [...SUMMARY_SOURCES, "dong_subtype.csv(FLAG) — exclude_flags 적용"],
  };
}

function get_validation(): ToolResult {
  const k = getData();
  return {
    data: { 검증_요약: k.validation, 민감도_분석: k.sensitivity, SHAP_중요도: k.shap },
    sources: ["validation_summary.csv", "sensitivity_final.csv", "shap_importance.csv"],
  };
}

/** 브리프 Markdown 뼈대. 문장 채우기는 5단계(LLM) — 여기서는 표의 값만 배치 */
function generate_brief(input: Record<string, unknown>): ToolResult {
  const k = getData();
  const ids = asArray<unknown>(input.emd_cds) ?? (input.emd_cd ? [input.emd_cd] : []);
  if (!ids.length) throw new ToolError("emd_cd 또는 emd_cds 가 필요합니다");
  const ds = ids.map((x) => resolveDong(x, input.region, k));

  if (ds.length === 1) {
    const d = ds[0];
    const f = flagInfo(d, k);
    const rule = k.rules.find((r) => r.SUBTYPE_ID === f.SUBTYPE_ID);
    const policy = k.levelPolicy.find((l) => l.RISK_LEVEL === d.RISK_LEVEL);
    const m = matchResources(d, k.resources);
    const details = rule ? [rule.DETAIL_1, rule.DETAIL_2, rule.DETAIL_3, rule.DETAIL_4, rule.DETAIL_5].filter(Boolean) : [];
    const md = [
      `# ${displayName(d)}(${d.SGG_NM}) 중장년 고립 위험 브리프`,
      "",
      "- 기준 기간: 2025.7~12",
      `- 위험 수준: ${d.RISK_LEVEL}단계 (${PRIORITY_LABEL[d.RISK_LEVEL]}) · 유형: ${d.GROUP} ${GROUP_NAME[d.GROUP]}${f.SUBTYPE_NM ? ` / ${f.SUBTYPE_NM}` : ""}${f.FLAGS.length ? ` · ${f.FLAGS.join("·")}` : ""}`,
      f.NOTE ? `- 해석 주의: ${f.NOTE}` : "",
      "",
      "## 핵심 수치",
      `- 종합 점수 ${d.TOTAL_SCORE} (인구축 ${d.POP_SCORE} + 지역축 ${d.REG_SCORE})`,
      `- 50·60대 인구 ${d.POP_5060.toLocaleString("ko-KR")}명 (총 ${d.TOT_POP_CNT.toLocaleString("ko-KR")}명)`,
      `- 군집 판별 확률 P_OWN ${d.P_OWN}`,
      "",
      "## 왜 위험한가",
      `- ${d.REASON_1}`,
      `- ${d.REASON_2}`,
      ...VARIABLE_META.map((v) => `- ${v.label}: 단계점수 ${d[`${v.code}_Q`]} (원값 ${v.format(d[v.code])})`),
      "{{문장: 변수별 설명}}",
      "",
      "## 권장 조치",
      rule?.CORE_ACTION ? `- 핵심: ${rule.CORE_ACTION}` : "- 핵심: (규칙표에 없음)",
      ...details.map((t) => `- 보완: ${t}`),
      rule?.LINK_PROGRAM ? `- 기존 사업 연계: ${rule.LINK_PROGRAM}` : "",
      "",
      "## 연결 자원",
      ...([...m.own, ...m.general].length
        ? [...m.own, ...m.general].map((r) => `- ${r.NAME} (${r.TYPE}) — ${r.SOURCE_URL.split(";")[0]}`)
        : ["- 등록된 자원 없음"]),
      "",
      "## 다음 점검",
      policy ? `- ${policy.CYCLE} · ${policy.ACTION_MODE}` : "",
      "",
      "## 근거 표",
      `- dong_cluster.csv · dong_subtype.csv · intervention_rules.csv(${f.SUBTYPE_ID ?? "-"}) · level_policy.csv · welfare_resources.csv`,
      "",
      "_이 브리프는 생성형 AI(Claude)가 결과표를 바탕으로 작성을 보조했습니다._",
    ]
      .filter((x, i, a) => !(x === "" && a[i - 1] === ""))
      .join("\n");
    return { data: { markdown: md }, sources: ["dong_cluster.csv", "dong_subtype.csv", "intervention_rules.csv", "level_policy.csv", "welfare_resources.csv"] };
  }

  const count = (xs: (string | number)[]) => xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});
  const md = [
    `# 분기 우선 동 브리프 (${ds.length}곳)`,
    "",
    "- 기준 기간: 2025.7~12",
    "",
    "| 순서 | 동 | 지역 | 단계 | 군집 | 50·60대 |",
    "|---|---|---|---|---|---|",
    ...ds.map((d, i) => `| ${i + 1} | ${displayName(d)} | ${d.SGG_NM} | ${d.RISK_LEVEL} | ${d.GROUP} | ${d.POP_5060.toLocaleString("ko-KR")} |`),
    "",
    "## 동별 한 줄",
    ...ds.map((d) => `- ${displayName(d)}: {{문장}}`),
    "",
    "## 분포",
    `- 군집: ${Object.entries(count(ds.map((d) => d.GROUP))).map(([g, c]) => `${g} ${c}`).join(" / ")}`,
    `- 단계: ${Object.entries(count(ds.map((d) => d.RISK_LEVEL))).sort(([a], [b]) => Number(b) - Number(a)).map(([l, c]) => `${l}단계 ${c}`).join(" / ")}`,
    "",
    "## 근거 표",
    "- dong_cluster.csv · dong_subtype.csv · level_policy.csv",
    "",
    "_이 브리프는 생성형 AI(Claude)가 결과표를 바탕으로 작성을 보조했습니다._",
  ].join("\n");
  return { data: { markdown: md }, sources: ["dong_cluster.csv", "dong_subtype.csv", "level_policy.csv"] };
}

// ---------------------------------------------------------------- 레지스트리

const IMPL: Record<string, (input: Record<string, unknown>) => ToolResult> = {
  list_dongs,
  get_dong,
  explain_dong,
  compare_dongs,
  get_cluster_profile,
  recommend_actions,
  get_resources,
  prioritize,
  get_validation,
  generate_brief,
};

export const TOOL_NAMES = Object.keys(IMPL);

export function runTool(name: string, input: unknown): ToolResult {
  const fn = IMPL[name];
  if (!fn) throw new ToolError(`알 수 없는 도구: ${name}`);
  return fn((input ?? {}) as Record<string, unknown>);
}

/** UI 에 보여줄 "조회 중: get_dong(서면)" 라벨 */
export function toolLabel(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const k = getData();
  const nm = (v: unknown) => {
    try {
      return displayName(resolveDong(v, i.region, k));
    } catch {
      return String(v);
    }
  };
  const arg =
    i.emd_cd !== undefined ? nm(i.emd_cd)
    : i.name !== undefined ? nm(i.name)
    : Array.isArray(i.emd_cds) ? i.emd_cds.map(nm).join(", ")
    : [i.region, i.group, i.n].filter((x) => x !== undefined).join(", ");
  return `${name}(${arg})`;
}

// ---------------------------------------------------------------- Anthropic tool 스키마

const regionProp = { type: "string", enum: ["강남구", "춘천시", "전체"], description: "지역. 춘천 '강남동'은 동 이름이지 지역이 아님" };
const dongProp = { type: "string", description: "동 코드(EMD_CD 8자리) 또는 동 이름(예: 서면, 역삼1동, 춘천 강남동)" };
const groupEnum = { type: "string", enum: [...GROUPS] };
const adminTypeProp = { type: "string", enum: ["읍면", "동"], description: "읍·면만(춘천 외곽) 또는 동만" };

export const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "list_dongs",
    description: "조건에 맞는 동 요약 목록. 단계·군집·지역·읍면 필터와 정렬(level_pop=단계↓→5060 인구↓, total=종합점수↓, pop5060=5060 인구↓).",
    input_schema: {
      type: "object",
      properties: {
        region: regionProp,
        levels: { type: "array", items: { type: "integer", enum: [1, 2, 3, 4, 5] } },
        groups: { type: "array", items: groupEnum },
        admin_type: adminTypeProp,
        sort: { type: "string", enum: ["level_pop", "total", "pop5060"] },
        limit: { type: "integer", minimum: 1, maximum: 47 },
      },
    },
  },
  {
    name: "get_dong",
    description: "동 1곳의 결과표 전체 행 + 하위유형·플래그·해석 주의(NOTE) + SHAP 판별 근거 파싱 + 같은 군집 평균(나란히).",
    input_schema: { type: "object", properties: { emd_cd: dongProp, region: regionProp }, required: ["emd_cd"] },
  },
  {
    name: "explain_dong",
    description: "동 1곳의 변수 5개 각각: 원값, 단계점수, 시군구 내 위험 순위, 위험 방향, 쉬운 말, 계산식, SHAP 판별 근거 여부. '왜 위험한가' 설명용.",
    input_schema: { type: "object", properties: { emd_cd: dongProp, region: regionProp }, required: ["emd_cd"] },
  },
  {
    name: "compare_dongs",
    description: "동 2~5곳의 변수·점수를 나란히.",
    input_schema: {
      type: "object",
      properties: { emd_cds: { type: "array", items: dongProp, minItems: 2, maxItems: 5 } },
      required: ["emd_cds"],
    },
  },
  {
    name: "get_cluster_profile",
    description: "군집 프로파일(변수 평균·단계점수 평균) + 한 줄 설명 + 소속 동 목록. group 생략 시 5종 전부.",
    input_schema: { type: "object", properties: { group: groupEnum } },
  },
  {
    name: "recommend_actions",
    description: "동 1곳의 하위유형별 대응 규칙(핵심 대응·보완 접근·기존 사업 연계) + 위험도 단계별 운영 주기.",
    input_schema: { type: "object", properties: { emd_cd: dongProp, region: regionProp }, required: ["emd_cd"] },
  },
  {
    name: "get_resources",
    description: "복지자원·현행 사업. emd_cd 를 주면 동 매칭 규칙(이 동 사업 / 연결 가능 / 다른 동 사례)으로, 아니면 지역·군집·유형 필터로.",
    input_schema: {
      type: "object",
      properties: {
        emd_cd: dongProp,
        region: regionProp,
        group: groupEnum,
        type: {
          type: "string",
          enum: ["안부확인", "방문돌봄", "스마트돌봄", "관계프로그램", "역할형참여", "상담전화", "주거", "정신건강", "이동지원", "발굴망", "전환기지원"],
        },
      },
    },
  },
  {
    name: "prioritize",
    description: "우선 동 상위 n곳. 규칙: 단계↓ → 같은 단계 안 5060 인구↓. constraints 로 플래그 제외·군집·읍면 필터. 각 동에 선정 이유 한 줄.",
    input_schema: {
      type: "object",
      properties: {
        region: regionProp,
        n: { type: "integer", minimum: 1, maximum: 47 },
        constraints: {
          type: "object",
          properties: {
            exclude_flags: { type: "array", items: { type: "string", enum: ["탐색지구", "관찰지구", "경계"] } },
            groups: { type: "array", items: groupEnum },
            admin_type: adminTypeProp,
          },
        },
      },
      required: ["n"],
    },
  },
  {
    name: "get_validation",
    description: "모델 신뢰도: 검증 요약(실루엣·DB·부트스트랩 ARI·대리모델 정확도), 민감도 분석, SHAP 변수 중요도.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "generate_brief",
    description: "동 1곳(emd_cd) 또는 여러 곳(emd_cds) 브리프의 Markdown 뼈대. {{문장}} 자리는 답변에서 채운다.",
    input_schema: {
      type: "object",
      properties: { emd_cd: dongProp, emd_cds: { type: "array", items: dongProp, maxItems: 10 }, region: regionProp },
    },
  },
];
