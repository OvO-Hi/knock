// 브리프 생성 (CLAUDE.md §4.5). 템플릿은 도구 결과로 채우고, Claude 는 현황 요약·담당자 메모 두 칸만 쓴다.
import Anthropic from "@anthropic-ai/sdk";
import { buildDongBrief, buildQuarterBrief, fillBrief, ungroundedNumbers, type BriefDraft } from "@/lib/brief";
import { MODEL, getClient, hasCredentials } from "@/lib/claude";
import { ToolError } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_TAG = "(AI 미연결 — 규칙 기반 요약)";

interface BriefRequest {
  emd_cd?: string;
  emd_cds?: string[];
  region?: string;
  n?: number;
}

const SYSTEM = `너는 지자체 복지 담당자용 브리프의 문장 두 칸만 쓰는 작성 보조원이다.
- 아래 브리프 템플릿에 있는 값만 쓴다. 템플릿에 없는 숫자·동 이름·사업명을 새로 만들지 않는다. 합계·평균·비율을 계산하지 않는다.
- 숫자는 템플릿 표기 그대로 쓴다(0.226을 22.6%로 바꾸지 않는다). 인력 수·예산·기간 같은 새 수치를 제안하지 않는다.
- 위험도는 "먼저 살필 순서"로 표현하고 "위험한 동네" 같은 낙인 표현을 쓰지 않는다. 상관을 인과로 말하지 않는다("~가 위험 쪽 신호로 잡혔다").
- 플래그(탐색지구·관찰지구·경계)나 해석 주의가 있으면 메모에 반영한다.
- 출력 형식은 정확히 다음 두 태그만:
<요약>현황 요약 — 3문장 이내</요약>
<메모>담당자 메모 — 다음 조치나 확인할 점, 2문장</메모>`;

const parseSlots = (text: string) => {
  const summary = /<요약>([\s\S]*?)<\/요약>/.exec(text)?.[1]?.trim();
  const memo = /<메모>([\s\S]*?)<\/메모>/.exec(text)?.[1]?.trim();
  return summary && memo ? { summary, memo } : null;
};

/** 두 칸 작성. 템플릿에 없는 숫자를 쓰면 그 숫자를 알려주고 한 번만 다시 요청 */
async function writeSlots(draft: BriefDraft): Promise<{ summary: string; memo: string } | null> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `브리프 템플릿:\n\n${draft.template}\n\n{{SUMMARY}}와 {{MEMO}}에 들어갈 문장을 써라.` },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await getClient().messages.create({ model: MODEL, max_tokens: 600, system: SYSTEM, messages });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const slots = parseSlots(text);
    if (!slots) return null;
    const bad = ungroundedNumbers(`${slots.summary} ${slots.memo}`, draft.template);
    if (!bad.length) return slots;
    console.warn(`[brief] 템플릿에 없는 숫자 (시도 ${attempt + 1}):`, bad.join(", "));
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: `다음 숫자는 템플릿에 없다: ${bad.join(", ")}. 템플릿 표기 그대로의 숫자만 써서 같은 형식으로 다시 써라.` },
    );
  }
  return null;
}

export async function POST(req: Request) {
  let body: BriefRequest;
  try {
    body = (await req.json()) as BriefRequest;
  } catch {
    return Response.json({ error: "JSON 본문이 필요합니다" }, { status: 400 });
  }

  let draft: BriefDraft;
  try {
    if (Array.isArray(body.emd_cds) && body.emd_cds.length) {
      draft = buildQuarterBrief({ emd_cds: body.emd_cds.slice(0, 20).map(String), region: body.region, n: body.n });
    } else if (body.emd_cd) {
      draft = buildDongBrief(String(body.emd_cd));
    } else if (body.region !== undefined || body.n !== undefined) {
      draft = buildQuarterBrief({ region: body.region, n: body.n });
    } else {
      return Response.json({ error: "emd_cd 또는 emd_cds/region/n 이 필요합니다" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof ToolError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }

  let slots: { summary: string; memo: string } | null = null;
  let reason: string | undefined;
  if (!hasCredentials()) reason = "no_api_key";
  else {
    try {
      slots = await writeSlots(draft);
      if (!slots) reason = "unusable_output";
    } catch (e) {
      if (!(e instanceof Anthropic.APIError)) throw e;
      console.error("[brief] Claude API 오류 → 규칙 기반", e.status, e.message);
      reason = `api_error_${e.status ?? "connection"}`;
    }
  }

  const markdown = slots
    ? fillBrief(draft, slots.summary, slots.memo)
    : fillBrief(draft, `${FALLBACK_TAG} ${draft.ruleSummary}`, draft.ruleMemo);
  return Response.json({ title: draft.title, markdown, mode: slots ? "ai" : "fallback", reason, sources: draft.sources });
}
