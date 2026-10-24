// 브리프 템플릿 (CLAUDE.md §4.5). 숫자·동 이름·조치·자원은 도구 결과를 그대로 넣고,
// LLM 은 {{SUMMARY}}(현황 요약, 3문장 이내)·{{MEMO}}(담당자 메모, 2문장) 두 칸만 쓴다.
import { GROUP_NAME } from "./labels";
import type { Group } from "./constants";
import { runTool, type ToolResult } from "./tools";

type Row = Record<string, unknown>;

export const SUMMARY_SLOT = "{{SUMMARY}}";
export const MEMO_SLOT = "{{MEMO}}";
export const PERIOD = "2025.7~12";
export const AI_NOTICE =
  "_이 문서는 모델 결과표를 바탕으로 생성형 AI(Claude)가 문장을 작성했습니다. 수치는 결과표 값을 그대로 인용했습니다._";

export interface BriefDraft {
  kind: "dong" | "quarter";
  title: string;
  /** {{SUMMARY}}·{{MEMO}} 자리가 남아 있는 템플릿 */
  template: string;
  /** AI 미연결 시 두 칸을 채울 규칙 기반 문장 */
  ruleSummary: string;
  ruleMemo: string;
  sources: string[];
}

const fmt = (n: unknown) => Number(n).toLocaleString("ko-KR");
const one = (n: unknown) => Number(n).toFixed(1);
const today = () =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const esc = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

function collect(results: ToolResult[]) {
  return [...new Set(results.flatMap((r) => r.sources))];
}

// ---------------------------------------------------------------- 동 브리프

export function buildDongBrief(emdCd: string): BriefDraft {
  const results: ToolResult[] = [];
  const call = (name: string, input: Row) => {
    const r = runTool(name, input);
    results.push(r);
    return r.data as Row;
  };

  const g = call("get_dong", { emd_cd: emdCd });
  const ex = call("explain_dong", { emd_cd: g.EMD_CD });
  const act = call("recommend_actions", { emd_cd: g.EMD_CD });
  const res = call("get_resources", { emd_cd: g.EMD_CD });
  // 순위 두 가지: 종합점수 순위(동점은 같은 순위) / 우선순위(단계→5060 인구) 전체·지역 내 순서
  const byTotal = (call("list_dongs", { sort: "total" }).동 as Row[]) ?? [];
  const totalRank = byTotal.filter((x) => Number(x.TOTAL_SCORE) > Number(g.TOTAL_SCORE)).length + 1;
  const orderOf = (rows: Row[]) => rows.find((x) => x.EMD_CD === g.EMD_CD)?.순서;
  const order = orderOf(call("prioritize", { n: 47 }).우선_동 as Row[]);
  const regionOrder = orderOf(call("prioritize", { region: g.SGG_CD, n: 47 }).우선_동 as Row[]);
  const regionCount = byTotal.filter((x) => x.지역 === g.SGG_NM).length;

  const name = String(g.이름);
  const rule = act.대응_규칙 as Row | null;
  const policy = act.운영_주기 as Row | null;
  const flags = (g.FLAGS as string[]) ?? [];
  const details = rule ? ["DETAIL_1", "DETAIL_2", "DETAIL_3", "DETAIL_4", "DETAIL_5"].map((k) => String(rule[k] ?? "")).filter(Boolean) : [];
  const resources = [...((res.이_동_사업 as Row[]) ?? []), ...((res.연결_가능 as Row[]) ?? [])];
  const reasons = ((g.REASONS as ({ label: string; side: string; shap: number } | null)[]) ?? []).filter(
    (r): r is { label: string; side: string; shap: number } => !!r,
  );

  const title = `${name}(${g.SGG_NM}) 중장년 고립 위험 브리프`;
  const md = [
    `# ${title}`,
    "",
    `기준 기간 ${PERIOD} · 생성일 ${today()}`,
    "",
    "## 위험 수준과 유형",
    `- 위험도 **${g.RISK_LEVEL}단계 (${g.PRIORITY_LABEL})** · 군집 ${g.GROUP} ${GROUP_NAME[g.GROUP as Group]}${g.SUBTYPE_NM ? ` · 하위유형 ${g.SUBTYPE_NM}` : ""}`,
    flags.length ? `- ${flags.join("·")}${g.NOTE ? `: ${g.NOTE}` : ""}${flags.includes("경계") ? ` (군집 확률 P_OWN ${g.P_OWN})` : ""}` : "",
    !flags.length && g.NOTE ? `- 해석 주의: ${g.NOTE}` : "",
    "",
    "## 현황 요약",
    SUMMARY_SLOT,
    "",
    "## 핵심 수치",
    "| 종합 점수 | 50·60대 인구 | 순위 |",
    "|---|---|---|",
    `| ${one(g.TOTAL_SCORE)} (인구축 ${one(g.POP_SCORE)} + 지역축 ${one(g.REG_SCORE)}) | ${fmt(g.POP_5060)}명 (총 ${fmt(g.TOT_POP_CNT)}명) | 종합점수 47개 동 중 ${totalRank}위 · 우선순위(단계→5060 인구) 전체 ${order ?? "-"}위, ${g.SGG_NM} ${regionOrder ?? "-"}위 (${regionCount}개 동 중) |`,
    "",
    "## 왜 위험한가",
    "| 변수 | 단계점수 (1~5) | 원값 | 위험 방향 | SHAP 판별 근거 |",
    "|---|---|---|---|---|",
    ...(ex.변수 as Row[]).map((v) => {
      const s = v.SHAP_판별근거 as { side: string; shap: number } | null;
      return `| ${v.이름} | ${v.단계점수} | ${esc(v.원값_표기)} | ${v.위험_방향} | ${s ? `${s.side} 쪽 (${s.shap >= 0 ? "+" : ""}${s.shap.toFixed(2)})` : "-"} |`;
    }),
    "",
    "## 권장 조치",
    rule?.CORE_ACTION ? `- **핵심**: ${rule.CORE_ACTION}` : "- **핵심**: 규칙표에 기재 없음",
    ...details.map((t) => `- 보완: ${t}`),
    rule?.LINK_PROGRAM ? `- 기존 사업 연계: ${rule.LINK_PROGRAM}` : "",
    "",
    "## 연결 자원",
    ...(resources.length
      ? resources.map((r) => {
          const url = String(r.SOURCE_URL).split(";")[0].trim();
          return `- ${r.NAME} (${r.TYPE}) — [출처](${url})`;
        })
      : ["- 등록된 자원이 없습니다 (welfare_resources.csv)"]),
    "",
    "## 다음 점검 시점",
    policy ? `- ${policy.CYCLE} (${policy.ACTION_MODE})` : "- level_policy.csv에 없음",
    "",
    "## 담당자 메모",
    MEMO_SLOT,
    "",
    "## 근거 표",
    ...collect(results).map((s) => `- ${s}`),
    "",
    "---",
    AI_NOTICE,
  ]
    .filter((x, i, a) => !(x === "" && a[i - 1] === ""))
    .join("\n");

  const ruleSummary = [
    `${name}은 위험도 ${g.RISK_LEVEL}단계(${g.PRIORITY_LABEL})·${g.GROUP} ${GROUP_NAME[g.GROUP as Group]} 동입니다. 종합점수는 47개 동 중 ${totalRank}위이고, 우선순위(단계→5060 인구)로는 전체 ${order ?? "-"}번째·${g.SGG_NM} 안에서 ${regionOrder ?? "-"}번째로 먼저 살필 곳입니다.`,
    reasons.length
      ? `군집 판별 근거는 ${reasons.map((r) => `${r.label.replace(/^\d-\d\s+/, "")}(${r.side} 쪽)`).join("·")} 신호입니다.`
      : "",
    policy ? `운영 주기는 ${policy.CYCLE}·${policy.ACTION_MODE}입니다.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const ruleMemo = [
    rule?.CORE_ACTION ? `핵심 대응은 '${rule.CORE_ACTION}'입니다.` : "핵심 대응은 규칙표에서 팀 확인이 필요합니다.",
    g.NOTE ? `해석 주의: ${g.NOTE}.` : resources.length ? `연결 가능한 자원 ${resources.length}건을 먼저 확인하세요.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { kind: "dong", title, template: md, ruleSummary, ruleMemo, sources: collect(results) };
}

// ---------------------------------------------------------------- 분기 브리프

export function buildQuarterBrief(opts: { emd_cds?: string[]; region?: string; n?: number }): BriefDraft {
  const results: ToolResult[] = [];
  const call = (name: string, input: Row) => {
    const r = runTool(name, input);
    results.push(r);
    return r.data as Row;
  };

  const n = Math.max(1, Math.min(47, opts.n ?? opts.emd_cds?.length ?? 10));
  const regionDongs = (call("list_dongs", { region: opts.region }).동 as Row[]) ?? [];
  let top: Row[];
  if (opts.emd_cds?.length) {
    // 화면에서 고른 목록을 그대로 쓰되, 순서·선정 이유는 prioritize 결과에서
    const all = (call("prioritize", { n: 47 }).우선_동 as Row[]) ?? [];
    const set = new Set(opts.emd_cds);
    top = all.filter((x) => set.has(String(x.EMD_CD)));
  } else {
    top = (call("prioritize", { region: opts.region, n }).우선_동 as Row[]) ?? [];
  }
  const actions = new Map(top.map((x) => [x.EMD_CD, call("recommend_actions", { emd_cd: x.EMD_CD })]));

  const regionNm = opts.region && opts.region !== "전체" ? String((regionDongs[0]?.지역 as string) ?? opts.region) : "강남구·춘천시";
  const count = (xs: unknown[]) => xs.reduce<Record<string, number>>((a, x) => ((a[String(x)] = (a[String(x)] ?? 0) + 1), a), {});
  const levelDist = count(regionDongs.map((d) => d.RISK_LEVEL));
  const groupDist = count(regionDongs.map((d) => d.GROUP));
  const topLevel = count(top.map((d) => d.RISK_LEVEL));

  const title = `${regionNm} 분기 우선 동 브리프 (상위 ${top.length}곳)`;
  const md = [
    `# ${title}`,
    "",
    `기준 기간 ${PERIOD} · 생성일 ${today()}`,
    "",
    "## 현황 요약",
    SUMMARY_SLOT,
    "",
    "## 지역 요약",
    `- 동 수: ${regionDongs.length}개`,
    `- 단계 분포: ${[5, 4, 3, 2, 1].map((l) => `${l}단계 ${levelDist[l] ?? 0}`).join(" / ")}`,
    `- 군집 분포: ${["HH1", "HH2", "HL", "LH", "LL"].map((g) => `${g} ${groupDist[g] ?? 0}`).join(" / ")}`,
    "",
    "## 우선 동",
    "| 순위 | 동 | 단계 | 군집 | 50·60대 | 핵심 대응 |",
    "|---|---|---|---|---|---|",
    ...top.map((x, i) => {
      const rule = (actions.get(x.EMD_CD)?.대응_규칙 as Row | null) ?? null;
      return `| ${i + 1} | ${x.이름} | ${x.RISK_LEVEL} | ${x.GROUP} | ${fmt(x.POP_5060)} | ${esc(rule?.CORE_ACTION || "-")} |`;
    }),
    "",
    "## 동별 한 줄",
    ...top.map((x) => {
      const a = actions.get(x.EMD_CD);
      const flags = (a?.FLAGS as string[]) ?? [];
      return `- **${x.이름}**: ${x.선정_이유}${flags.length ? ` · ${flags.join("·")}${a?.NOTE ? `(${a.NOTE})` : ""}` : ""}`;
    }),
    "",
    "## 담당자 메모",
    MEMO_SLOT,
    "",
    "## 근거 표",
    ...collect(results).map((s) => `- ${s}`),
    "",
    "---",
    AI_NOTICE,
  ].join("\n");

  const first = top[0];
  const ruleSummary = [
    `${regionNm} ${regionDongs.length}개 동 가운데 이번 분기 먼저 살필 ${top.length}곳을 단계↓ → 50·60대 인구↓ 순으로 골랐습니다.`,
    `이 중 ${Object.entries(topLevel).sort(([a], [b]) => Number(b) - Number(a)).map(([l, c]) => `${l}단계 ${c}곳`).join(", ")}입니다.`,
    first ? `가장 먼저 살필 곳은 ${first.이름}(${first.RISK_LEVEL}단계, 50·60대 ${fmt(first.POP_5060)}명)입니다.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const flagged = top.filter((x) => ((actions.get(x.EMD_CD)?.FLAGS as string[]) ?? []).length);
  const ruleMemo = [
    "동별 핵심 대응은 위 표의 하위유형 규칙을 따릅니다.",
    flagged.length ? `플래그가 있는 ${flagged.map((x) => x.이름).join("·")}은 해석 주의 문구를 함께 검토하세요.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { kind: "quarter", title, template: md, ruleSummary, ruleMemo, sources: collect(results) };
}

export function fillBrief(draft: BriefDraft, summary: string, memo: string): string {
  return draft.template.replace(SUMMARY_SLOT, summary.trim()).replace(MEMO_SLOT, memo.trim());
}

/**
 * LLM 문장의 숫자 중 템플릿에 없는 것 (가드레일 1: 새 수치 생성 금지).
 * 쉼표를 지우고, 소수(10.0)와 정수 부분(2025.7 → 2025, 7)을 모두 알려진 값으로 본다. 1자리 정수는 허용.
 */
export function ungroundedNumbers(text: string, template: string): string[] {
  const norm = (s: string) => s.replace(/,/g, "");
  const t = norm(template);
  const known = new Set([...(t.match(/\d+\.\d+/g) ?? []), ...(t.match(/\d+/g) ?? [])].flatMap((x) => [x, String(Number(x))]));
  const used = norm(text).match(/\d+(\.\d+)?/g) ?? [];
  return used.filter((x) => x.length > 1 && !known.has(x) && !known.has(String(Number(x))));
}

export const numbersGrounded = (text: string, template: string) => ungroundedNumbers(text, template).length === 0;
