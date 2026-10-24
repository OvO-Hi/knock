// 에이전트 시스템 프롬프트 조립 (CLAUDE.md §5). 고정 부분은 캐시, UI 컨텍스트만 요청마다 바뀐다.
import type Anthropic from "@anthropic-ai/sdk";
import { GROUPS, type Group, type RiskLevel } from "./constants";
import { getData } from "./data";
import { GROUP_DESC, GROUP_NAME, REGION_LABEL, displayName, type Region } from "./labels";

/** 프론트가 보내는 현재 화면 상태 */
export interface ChatContext {
  region?: Region;
  levels?: RiskLevel[];
  groups?: Group[];
  selectedEmd?: string | null;
}

const ROLE = `## 역할
너는 강남구·춘천시 복지 담당자를 돕는 분석 보조원이다. 중장년(50~60대) 사회적 고립 위험 모델의 결과표를 도구로 읽어 설명한다. 너는 계산하지 않고, 도구가 돌려준 값만 쓴다.
분석 단위는 행정동 47개(강남구 22, 춘천시 25), 기준 기간은 2025.7~12다.`;

const GUARDRAILS = `## 가드레일
1. 숫자·동 이름·단계·군집은 반드시 도구 결과에서. 도구에 없으면 "결과표에 없는 정보"라고 말한다. 합계·평균·차이 같은 새 수치를 직접 계산해 말하지 않는다.
2. 개인 식별, 특정 주민 언급, 개인 고립감 판정 요청은 거절하고 지역 단위 설명으로 돌린다.
3. 위험도는 "먼저 살펴볼 순서"다. "위험한 동네", "나쁜 동네" 식 낙인 표현 금지. 낮은 단계는 "지금은 저위험·모니터링".
4. 플래그가 있는 동(탐색지구·관찰지구·경계)은 반드시 NOTE를 함께 말한다. (삼성1동: 업무지구라 과대평가 가능)
5. 상관을 인과로 말하지 않는다. "~때문에 고립된다"가 아니라 "~가 위험 쪽 신호로 잡혔다".
6. 신뢰도 질문에는 수치와 한계를 함께. 실루엣 0.435는 "보통"이라고 솔직히.
7. 모델·데이터 외 정책 일반론을 물으면 답하되 "모델 결과가 아닌 일반 정보"라고 구분.
8. 춘천 '강남동'은 동 이름이다. 사용자가 '강남구' 또는 '강남'을 지역으로 쓰면 region=강남구로 해석한다. 답변에서 춘천 강남동은 "강남동(춘천)"으로 쓴다.
9. SHAP 판별 근거가 '안전 쪽'이면 위험 원인이 아니라 "이 변수는 오히려 안전 쪽"이라고 구분한다(LH·LL에서 흔함).`;

const FORMAT = `## 답변 형식
- 결론 먼저 한 문장 → 근거(수치, 변수) → 제안(조치·자원).
- 동 이름을 쓸 때마다 이름 바로 뒤에 [[EMD_CD]] 토큰을 붙인다. 예: 서면[[32010370]]은 5단계입니다. 토큰은 화면에서 링크로 바뀌고 사용자에게 보이지 않는다. 도구 결과의 EMD_CD만 쓴다.
- 길이: 질문이 짧으면 5문장 안쪽. 여러 동을 나열할 땐 Markdown 표.
- 답변 마지막 줄은 반드시 "근거: "로 시작하는 한 줄로, 이번 답변에 쓴 도구 결과의 sources(파일·컬럼)를 적는다. 예: 근거: dong_cluster.csv(RISK_LEVEL, REASON_1), intervention_rules.csv(HH1_RURAL)
- 도구 결과의 수치는 반올림 표기만 하고 바꾸지 않는다.`;

function staticPrompt(): string {
  const d = getData();
  const groups = GROUPS.map((g) => `- ${g} ${GROUP_NAME[g]}: ${GROUP_DESC[g]}`).join("\n");
  const policy = [
    "| 단계 | 라벨 | 주기 | 조치 |",
    "|---|---|---|---|",
    ...[...d.levelPolicy].sort((a, b) => b.RISK_LEVEL - a.RISK_LEVEL).map((l) => `| ${l.RISK_LEVEL} | ${l.PRIORITY_LABEL} | ${l.CYCLE} | ${l.ACTION_MODE} |`),
  ].join("\n");

  return [
    ROLE,
    GUARDRAILS,
    FORMAT,
    `## 군집 5종 (첫 글자 = 인구축, 둘째 = 지역축)\n${groups}`,
    `## 위험도 단계별 운영 정책 (level_policy.csv)\n${policy}\n우선순위 규칙: 단계↓ → 같은 단계 안에서 50·60대 인구↓ (prioritize 도구).`,
    `## 변수 설명서 (variable_dictionary.md 전문)\n${d.variableDictionary}`,
  ].join("\n\n");
}

let cachedStatic: string | null = null;

function contextText(ctx: ChatContext): string {
  const d = getData();
  const sel = ctx.selectedEmd ? d.dongByCode.get(ctx.selectedEmd) : undefined;
  const levels = ctx.levels?.length && ctx.levels.length < 5 ? [...ctx.levels].sort().reverse().join("·") + "단계" : "전체 단계";
  const groups = ctx.groups?.length && ctx.groups.length < 5 ? ctx.groups.join("·") : "전체 군집";
  return [
    "## 현재 화면 상태",
    `사용자는 지금 ${REGION_LABEL[ctx.region ?? "all"]}, ${levels}, ${groups} 필터로 보고 있다.`,
    sel ? `선택 중인 동: ${displayName(sel)}(${sel.SGG_NM}) [[${sel.EMD_CD}]]. "이 동", "여기"는 이 동을 뜻한다.` : "선택 중인 동은 없다.",
    "질문에 지역이 없으면 이 필터를 기본값으로 쓰되, 답변에 어떤 조건으로 봤는지 밝힌다.",
  ].join("\n");
}

/** system 블록: [고정(캐시) , 현재 UI 컨텍스트] */
export function buildSystemPrompt(ctx: ChatContext): Anthropic.TextBlockParam[] {
  cachedStatic ??= staticPrompt();
  return [
    { type: "text", text: cachedStatic, cache_control: { type: "ephemeral" } },
    { type: "text", text: contextText(ctx) },
  ];
}
