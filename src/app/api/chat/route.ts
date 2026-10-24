// 에이전트 대화 (CLAUDE.md §4.4). Claude tool use 루프 + SSE 스트리밍. AI 연결 실패 시 규칙 기반 폴백.
//
// SSE 이벤트
//   meta  {mode: "ai" | "fallback", reason?}
//   tool  {name, input, label}         도구 호출 ("조회 중: get_dong(서면)")
//   text  {delta}                      답변 텍스트 조각
//   done  {mode}
//   error {message}                    스트리밍 도중 실패 (이미 텍스트가 나간 뒤)
import Anthropic from "@anthropic-ai/sdk";
import { GROUPS, LEVELS, type Group, type RiskLevel } from "@/lib/constants";
import { answerFallback } from "@/lib/fallback";
import { buildSystemPrompt, type ChatContext } from "@/lib/prompt";
import { TOOL_DEFS, ToolError, runTool, toolLabel } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const MAX_TOKENS = 1500;
const MAX_TOOL_ROUNDS = 6;
const MAX_INPUT = 2000;
const HISTORY = 12;

interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  ctx?: ChatContext;
}

let client: Anthropic | null = null;
const hasCredentials = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

function parseBody(body: unknown): { messages: Anthropic.MessageParam[]; ctx: ChatContext; question: string } | string {
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
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      const fallback = (reason: string) => {
        const a = answerFallback(question, ctx);
        send("meta", { mode: "fallback", reason });
        for (const label of a.tools) send("tool", { name: label.split("(")[0], label });
        send("text", { delta: a.text });
        send("done", { mode: "fallback" });
      };

      try {
        if (!hasCredentials()) {
          fallback("no_api_key");
          return;
        }
        client ??= new Anthropic();
        let sentText = false;
        try {
          sentText = await runAgent(client, messages, ctx, send);
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

/** tool_use 루프. 텍스트를 하나라도 내보냈으면 true (이후 실패는 폴백하지 않음) */
async function runAgent(
  client: Anthropic,
  history: Anthropic.MessageParam[],
  ctx: ChatContext,
  send: (event: string, data: unknown) => void,
): Promise<boolean> {
  const messages: Anthropic.MessageParam[] = [...history];
  const system = buildSystemPrompt(ctx);
  let sentText = false;
  let metaSent = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: TOOL_DEFS,
      // 도구 한도에 닿으면 마지막 호출은 도구 없이 답만 하게
      tool_choice: round === MAX_TOOL_ROUNDS ? { type: "none" } : { type: "auto" },
      messages,
    });
    stream.on("text", (delta) => {
      if (!metaSent) {
        send("meta", { mode: "ai" });
        metaSent = true;
      }
      sentText = true;
      send("text", { delta });
    });

    const message = await stream.finalMessage();
    if (message.stop_reason !== "tool_use") break; // end_turn · max_tokens · refusal 등

    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUses.length) break;
    if (!metaSent) {
      send("meta", { mode: "ai" });
      metaSent = true;
    }
    messages.push({ role: "assistant", content: message.content });

    const results: Anthropic.ToolResultBlockParam[] = toolUses.map((t) => {
      send("tool", { name: t.name, input: t.input, label: safeLabel(t.name, t.input) });
      try {
        const r = runTool(t.name, t.input);
        return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(r) };
      } catch (e) {
        const msg = e instanceof ToolError ? e.message : "도구 실행 오류";
        if (!(e instanceof ToolError)) console.error("[chat] 도구 오류", t.name, e);
        return { type: "tool_result", tool_use_id: t.id, is_error: true, content: msg };
      }
    });
    // 같은 턴의 tool_result 는 한 user 메시지에 모아 보낸다
    messages.push({ role: "user", content: results });
    if (sentText) send("text", { delta: "\n\n" });
  }
  return sentText;
}

function safeLabel(name: string, input: unknown): string {
  try {
    return toolLabel(name, input);
  } catch {
    return name;
  }
}
