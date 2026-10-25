// 에이전트 대화 (CLAUDE.md §4.4). Claude tool use 루프 + SSE 스트리밍 + 답변 사후 검사. AI 연결 실패 시 규칙 기반 폴백.
//
// SSE 이벤트
//   meta  {mode: "ai" | "fallback" | "cache", reason?}
//   tool  {name, input, label}         도구 호출 ("조회 중: get_dong(서면)")
//   text  {delta}                      답변 텍스트 조각 (스트리밍)
//   guard {violations, retried, removed}  사후 검사 결과
//   final {text}                       검사 후 수정본. 프론트는 본문을 이걸로 교체
//   done  {mode}
//   error {message}                    스트리밍 도중 실패 (이미 텍스트가 나간 뒤)
import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock, BetaMessageParam, BetaToolResultBlockParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { GROUPS, LEVELS, type Group, type RiskLevel } from "@/lib/constants";
import { MODEL, getClient, hasCredentials, requestParams } from "@/lib/claude";
import { getData } from "@/lib/data";
import { lookupDemoCache, type DemoCacheEntry } from "@/lib/demoCache";
import { answerFallback } from "@/lib/fallback";
import { collectFacts, findViolations, formatViolations, hasDashes, removeViolations, replaceDashes, type Violation } from "@/lib/guard";
import { buildSystemPrompt, type ChatContext } from "@/lib/prompt";
import { TOOL_DEFS, ToolError, runTool, toolLabel, type ToolResult } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOOL_ROUNDS = 6;
const MAX_INPUT = 2000;
const HISTORY = 12;

type Send = (event: string, data: unknown) => void;

interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  ctx?: ChatContext;
}

function parseBody(body: unknown): { messages: BetaMessageParam[]; ctx: ChatContext; question: string } | string {
  const b = body as ChatRequest;
  if (!b || !Array.isArray(b.messages) || !b.messages.length) return "messages 가 비어 있습니다";
  const msgs = b.messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-HISTORY);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const last = msgs.at(-1);
  if (!last || last.role !== "user") return "마지막 메시지는 사용자 질문이어야 합니다";
  if (last.content.length > MAX_INPUT) return `질문은 ${MAX_INPUT.toLocaleString()}자 이내로 입력하세요`;

  const c = b.ctx ?? {};
  const ctx: ChatContext = {
    region: c.region === "11230" || c.region === "32010" ? c.region : "all",
    levels: Array.isArray(c.levels) ? (c.levels.filter((l) => (LEVELS as readonly number[]).includes(l)) as RiskLevel[]) : undefined,
    groups: Array.isArray(c.groups) ? (c.groups.filter((g) => (GROUPS as readonly string[]).includes(g)) as Group[]) : undefined,
    selectedEmd: typeof c.selectedEmd === "string" && /^\d{8}$/.test(c.selectedEmd) ? c.selectedEmd : null,
  };
  return {
    messages: msgs.map((m) => ({ role: m.role, content: m.content.slice(0, MAX_INPUT * 4) })),
    ctx,
    question: last.content,
  };
}

// ---------------------------------------------------------------- 데모 캐시 (DEMO_CACHE=1)

async function replayCache(e: DemoCacheEntry, send: Send) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  send("meta", { mode: "cache" });
  for (const label of e.tools) {
    send("tool", { name: label.split("(")[0], label });
    await sleep(150);
  }
  // 스트리밍처럼 조각내 보낸다
  for (let i = 0; i < e.text.length; i += 24) {
    send("text", { delta: e.text.slice(i, i + 24) });
    await sleep(15);
  }
  send("done", { mode: "cache" });
}

// ---------------------------------------------------------------- 핸들러

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON 본문이 필요합니다" }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });
  const { messages, ctx, question } = parsed;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: Send = (event, data) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      const fallback = (reason: string) => {
        const a = answerFallback(question, ctx);
        send("meta", { mode: "fallback", reason });
        for (const label of a.tools) send("tool", { name: label.split("(")[0], label });
        send("text", { delta: a.text });
        send("done", { mode: "fallback" });
      };

      try {
        // 첫 질문만 캐시 대상 (이어지는 대화는 맥락이 달라질 수 있음. 데모 시나리오는 순서대로 묻는다)
        const hit = lookupDemoCache(question);
        if (hit) {
          await replayCache(hit, send);
          return;
        }
        if (!hasCredentials()) {
          fallback("no_api_key");
          return;
        }
        let sentText = false;
        try {
          const r = await runAgent(getClient(), messages, ctx, send, () => (sentText = true));
          await guardAnswer(getClient(), r, send);
          send("done", { mode: "ai" });
        } catch (err) {
          // 아무것도 보내기 전 실패면 폴백 답변, 도중 실패면 오류 이벤트
          if (!sentText && err instanceof Anthropic.APIError) {
            console.error("[chat] Claude API 오류 → 폴백", err.status, err.message);
            fallback(`api_error_${err.status ?? "connection"}`);
          } else {
            console.error("[chat] 처리 오류", err);
            send("error", { message: "답변 생성 중 오류가 발생했습니다. 다시 시도해 주세요." });
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// ---------------------------------------------------------------- 도구 루프

interface AgentRun {
  /** 사용자에게 스트리밍한 답변 전체 */
  text: string;
  /** 이번 턴 도구 결과 (사후 검사용) */
  toolResults: ToolResult[];
  /** 마지막 assistant 응답까지 포함한 대화 (재요청에 그대로 이어 붙인다, append-only) */
  messages: BetaMessageParam[];
  system: ReturnType<typeof buildSystemPrompt>;
}

function baseParams(system: AgentRun["system"]) {
  return { model: MODEL, system, tools: TOOL_DEFS, ...requestParams("agent") };
}

async function runAgent(client: Anthropic, history: BetaMessageParam[], ctx: ChatContext, send: Send, onText: () => void): Promise<AgentRun> {
  const messages: BetaMessageParam[] = [...history];
  const system = buildSystemPrompt(ctx);
  const toolResults: ToolResult[] = [];
  let text = "";
  let metaSent = false;
  const meta = () => {
    if (!metaSent) send("meta", { mode: "ai" });
    metaSent = true;
  };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const stream = client.beta.messages.stream({
      ...baseParams(system),
      // 도구 한도에 닿으면 마지막 호출은 도구 없이 답만 하게
      tool_choice: round === MAX_TOOL_ROUNDS ? { type: "none" } : { type: "auto" },
      messages,
    });
    stream.on("text", (delta) => {
      meta();
      onText();
      text += delta;
      send("text", { delta });
    });

    const message = await stream.finalMessage();
    messages.push({ role: "assistant", content: message.content as BetaContentBlock[] });
    if (message.stop_reason === "refusal") {
      const note = "이 질문에는 답할 수 없습니다. 지역 단위 결과표에 관한 질문으로 다시 물어봐 주세요.";
      text += note;
      send("text", { delta: note });
      break;
    }
    if (message.stop_reason !== "tool_use") break; // end_turn · max_tokens 등

    const toolUses = message.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
    if (!toolUses.length) break;
    meta();

    const results: BetaToolResultBlockParam[] = toolUses.map((t) => {
      send("tool", { name: t.name, input: t.input, label: safeLabel(t.name, t.input) });
      try {
        const r = runTool(t.name, t.input);
        toolResults.push(r);
        return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(r) };
      } catch (e) {
        const msg = e instanceof ToolError ? e.message : "도구 실행 오류";
        if (!(e instanceof ToolError)) console.error("[chat] 도구 오류", t.name, e);
        return { type: "tool_result", tool_use_id: t.id, is_error: true, content: msg };
      }
    });
    // 같은 턴의 tool_result 는 한 user 메시지에 모아 보낸다
    messages.push({ role: "user", content: results });
    if (text) {
      text += "\n\n";
      send("text", { delta: "\n\n" });
    }
  }
  return { text, toolResults, messages, system };
}

// ---------------------------------------------------------------- 사후 검사 (CLAUDE.md §5.2)

/**
 * 완료된 답변을 도구 결과와 대조. 위반이 있으면 위반 목록을 붙여 1회 재요청(도구 없이 다시 쓰기),
 * 그래도 남으면 해당 문장을 지우고 안내 한 줄. 수정본은 "final" 이벤트로 교체한다.
 */
async function guardAnswer(client: Anthropic, run: AgentRun, send: Send) {
  const facts = collectFacts(run.toolResults, getData().variableDictionary);
  const first = findViolations(run.text, facts);
  if (!first.length) {
    send("guard", { violations: [], retried: false, removed: false });
    // 줄표만 있으면 가운뎃점으로 바꾼 수정본으로 교체
    if (hasDashes(run.text)) send("final", { text: replaceDashes(run.text) });
    return;
  }
  console.warn("[chat] 사후 검사 위반", first);

  let text = run.text;
  let remaining: Violation[] = first;
  try {
    const res = await client.beta.messages.create({
      ...baseParams(run.system),
      tool_choice: { type: "none" },
      messages: [
        ...run.messages,
        {
          role: "user",
          content: `아래 항목은 도구 결과에 없다. 해당 문장을 도구 결과 값으로 고치거나 삭제해 답변 전체를 다시 써라. 형식(결론→근거→제안, [[EMD_CD]] 토큰, 마지막 근거 줄)은 그대로 지킨다.\n${formatViolations(first)}`,
        },
      ],
    });
    const rewritten = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (rewritten && res.stop_reason !== "refusal") {
      text = rewritten;
      remaining = findViolations(text, facts);
    }
  } catch (e) {
    if (!(e instanceof Anthropic.APIError)) throw e;
    console.error("[chat] 재요청 실패, 문장 제거로 처리", e.status);
  }
  const removed = remaining.length > 0;
  if (removed) text = removeViolations(text, remaining);
  send("guard", { violations: first, retried: true, removed, remaining });
  send("final", { text: replaceDashes(text) });
}

function safeLabel(name: string, input: unknown): string {
  try {
    return toolLabel(name, input);
  } catch {
    return name;
  }
}
