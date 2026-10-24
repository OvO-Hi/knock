// AI 연결이 안 될 때의 규칙 기반 답변 (CLAUDE.md §4.4 폴백). 질문에서 키워드를 찾아 도구를 직접 부르고 템플릿 문장으로 답한다.
import { GROUPS, type Group } from "./constants";
import { getData, type DongRow } from "./data";
import { GROUP_DESC, GROUP_NAME, displayName } from "./labels";
import type { ChatContext } from "./prompt";
import { runTool, toolLabel, type ToolResult } from "./tools";

type Row = Record<string, unknown>;

export interface FallbackAnswer {
  text: string;
  /** 호출한 도구 라벨 (UI "조회 중" 표시용) */
  tools: string[];
}

/** 질문에 나온 동 (긴 이름 우선, '강남구'의 '강남'은 동으로 보지 않음) */
function findDongs(q: string): DongRow[] {
  const d = getData();
  const text = q.replace(/강남구/g, "");
  const names = d.dongs
    .flatMap((x) => [{ key: displayName(x), x }, { key: x.EMD_NM, x }])
    .sort((a, b) => b.key.length - a.key.length);
  const found: DongRow[] = [];
  let rest = text;
  for (const { key, x } of names) {
    if (rest.includes(key)) {
      if (!found.includes(x)) found.push(x);
      rest = rest.split(key).join(" ");
    }
  }
  return found;
}

function regionOf(q: string, ctx: ChatContext): string | undefined {
  if (/춘천/.test(q)) return "춘천시";
  if (/강남구|강남\s/.test(q) || /^강남/.test(q.trim())) return "강남구";
  if (ctx.region === "11230") return "강남구";
  if (ctx.region === "32010") return "춘천시";
  return undefined;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const tag = (x: Row) => `${x.이름}[[${x.EMD_CD}]]`;
const sourcesLine = (rs: ToolResult[]) => `근거: ${[...new Set(rs.flatMap((r) => r.sources))].join(", ")}`;

export function answerFallback(q: string, ctx: ChatContext): FallbackAnswer {
  const tools: string[] = [];
  const results: ToolResult[] = [];
  const call = (name: string, input: Row) => {
    tools.push(toolLabel(name, input));
    const r = runTool(name, input);
    results.push(r);
    return r.data as Row;
  };

  // 1) 신뢰도
  if (/믿|신뢰|정확|검증|타당/.test(q)) {
    const v = call("get_validation", {});
    const s = v.검증_요약 as Row;
    const lines = [
      `분리도는 보통 수준이지만, 표본·설정을 바꿔도 결과가 꽤 안정적입니다.`,
      "",
      `- 실루엣 계수 ${s["실루엣 계수"]} (보통), Davies-Bouldin 지수 ${s["Davies-Bouldin 지수"]}`,
      `- 부트스트랩 안정성 ARI(100회) ${s["부트스트랩 안정성 ARI (100회)"]}`,
      `- 대리모델 RF 정확도 ${s["대리모델 RF 정확도 (반복 5-fold×20)"]} (표준편차 ${s["대리모델 RF 정확도 표준편차"]})`,
      `- 한계: 정답(실제 고립 여부) 데이터가 없고, 47개 동 소표본이며, 업무지구(삼성1동)는 유동인구 영향으로 과대평가될 수 있습니다.`,
      "",
      sourcesLine(results),
    ];
    return { text: lines.join("\n"), tools };
  }

  const dongs = findDongs(q);
  const sel = ctx.selectedEmd ? getData().dongByCode.get(ctx.selectedEmd) : undefined;

  // 2) 우선순위
  if (/우선|어디부터|먼저|순서/.test(q) && dongs.length === 0) {
    const region = regionOf(q, ctx);
    const adminType = /[읍면]\s*(중|에서|지역)|외곽/.test(q) ? "읍면" : undefined;
    const p = call("prioritize", { region, n: 5, constraints: adminType ? { admin_type: adminType } : undefined });
    const rows = p.우선_동 as Row[];
    const lines = [
      `${region ?? "전체"}${adminType ? " 읍·면" : ""}에서 이번 분기 먼저 살펴볼 곳은 ${rows[0] ? tag(rows[0]) : "-"}부터입니다 (단계↓ → 50·60대 인구↓ 순).`,
      "",
      "| 순서 | 동 | 단계 | 군집 | 50·60대 |",
      "|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.순서} | ${tag(r)} | ${r.RISK_LEVEL} | ${r.GROUP} | ${fmt(Number(r.POP_5060))} |`),
      "",
      sourcesLine(results),
    ];
    return { text: lines.join("\n"), tools };
  }

  // 3) 인구 많은 순 목록
  if (/인구/.test(q) && /많은|순|상위/.test(q) && dongs.length === 0) {
    const region = regionOf(q, ctx);
    const n = Number(q.match(/(\d+)\s*(개|곳)/)?.[1] ?? 5);
    const l = call("list_dongs", { region, sort: "pop5060", limit: n });
    const rows = l.동 as Row[];
    return {
      text: [
        `${region ?? "전체"} 50·60대 인구가 많은 순 상위 ${rows.length}곳입니다.`,
        "",
        "| 동 | 50·60대 | 단계 | 군집 |",
        "|---|---|---|---|",
        ...rows.map((r) => `| ${tag(r)} | ${fmt(Number(r.POP_5060))} | ${r.RISK_LEVEL} | ${r.GROUP} |`),
        "",
        sourcesLine(results),
      ].join("\n"),
      tools,
    };
  }

  // 4) 군집 비교
  const groups = GROUPS.filter((g) => new RegExp(`\\b${g}\\b`, "i").test(q)) as Group[];
  if (groups.length && dongs.length === 0) {
    for (const g of groups) call("get_cluster_profile", { group: g });
    return {
      text: [
        ...groups.map((g) => `- **${g} ${GROUP_NAME[g]}**: ${GROUP_DESC[g]} (${getData().clusterProfiles.find((c) => c.GROUP === g)?.N_DONG}개 동)`),
        "",
        sourcesLine(results),
      ].join("\n"),
      tools,
    };
  }

  // 5) 동 조회 (질문에 나온 동, 없으면 "왜"·"이 동" 질문에 선택 동)
  const target = dongs[0] ?? (/왜|이 동|여기|이곳/.test(q) ? sel : undefined);
  if (target) {
    const g = call("get_dong", { emd_cd: target.EMD_CD });
    const a = call("recommend_actions", { emd_cd: target.EMD_CD });
    const reasons = (g.REASONS as ({ label: string; side: string; shap: number } | null)[]).filter(Boolean) as {
      label: string;
      side: string;
      shap: number;
    }[];
    const rule = a.대응_규칙 as Row | null;
    const policy = a.운영_주기 as Row | null;
    const flags = g.FLAGS as string[];
    const varName = (label: string) => label.replace(/^\d-\d\s+/, "");
    const shap = (v: number) => `SHAP ${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
    const bullets = [
      `종합 점수 ${Number(g.TOTAL_SCORE).toFixed(1)} = 인구축 ${Number(g.POP_SCORE).toFixed(1)} + 지역축 ${Number(g.REG_SCORE).toFixed(1)}, 50·60대 ${fmt(Number(g.POP_5060))}명`,
      ...reasons.map((r) =>
        r.side === "위험"
          ? `판별 근거: '${varName(r.label)}' 변수가 위험 쪽 신호로 잡혔습니다 (${shap(r.shap)}).`
          : `판별 근거: '${varName(r.label)}' 변수는 오히려 안전 쪽입니다 (${shap(r.shap)}).`,
      ),
      flags.length ? `${flags.join("·")}: ${g.NOTE ?? `군집 확률 P_OWN ${g.P_OWN}`}` : g.NOTE ? `해석 주의: ${g.NOTE}` : "",
      rule?.CORE_ACTION ? `권장 조치: ${rule.CORE_ACTION}` : "",
      policy ? `운영 주기: ${policy.CYCLE} · ${policy.ACTION_MODE}` : "",
    ].filter(Boolean);
    const lines = [
      `${tag(g)}은 위험도 ${g.RISK_LEVEL}단계(${g.PRIORITY_LABEL})이고, 군집은 ${g.GROUP} ${GROUP_NAME[g.GROUP as Group]}${g.SUBTYPE_NM ? ` · ${g.SUBTYPE_NM}` : ""}입니다.`,
      "",
      ...bullets.map((b) => `- ${b}`),
      "",
      sourcesLine(results),
    ];
    return { text: lines.join("\n"), tools };
  }

  return {
    text: [
      "규칙 기반 모드에서는 다음 질문에 답할 수 있습니다.",
      "",
      "- 동 이름이 들어간 질문 (예: 서면은 왜 5단계예요?)",
      "- 우선순위 (예: 춘천 외곽 면 중 어디부터?)",
      "- 신뢰도 (예: 이 결과 믿어도 돼요?)",
      "- 인구 많은 순 목록, 군집(HH1·HH2·HL·LH·LL) 설명",
    ].join("\n"),
    tools,
  };
}
