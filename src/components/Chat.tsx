"use client";
// ③ 에이전트 대화 (CLAUDE.md §4.4). /api/chat SSE 를 받아 스트리밍 표시, [[EMD_CD]] 토큰은 동 링크로.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { displayName } from "@/lib/labels";
import type { DashboardData } from "@/lib/useDashboardData";
import { useUi } from "@/store/ui";

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
  tools: string[];
  mode?: "ai" | "fallback";
  status: "streaming" | "done" | "error";
  error?: string;
}

let nextId = 1;
const MAX_INPUT = 2000;

/** SSE 응답을 이벤트 단위로 읽는다 */
async function readSse(res: Response, on: (event: string, data: Record<string, unknown>) => void) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (data) on(event, JSON.parse(data));
    }
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** hast 노드의 텍스트 */
type HastNode = { type: string; value?: string; children?: HastNode[] };
const nodeText = (n?: HastNode): string => (!n ? "" : n.type === "text" ? (n.value ?? "") : (n.children ?? []).map(nodeText).join(""));

export default function Chat({ data }: { data: DashboardData | null }) {
  const { chatOpen, setChatOpen, chatDraft, region, levels, groups, selectedEmd, focusOnMap } = useUi();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = selectedEmd ? data?.dongByCode.get(selectedEmd) : undefined;

  // 패널 [대화에서 묻기] → 입력창에 넣고 포커스
  useEffect(() => {
    if (!chatDraft) return;
    setInput(chatDraft.text);
    inputRef.current?.focus(); // 펼침과 같은 커밋에서 textarea 가 이미 마운트돼 있다
  }, [chatDraft]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, chatOpen]);

  // "동이름[[EMD_CD]]" → "[동이름](#emd-EMD_CD)"
  const linkify = useMemo(() => {
    if (!data) return (t: string) => t.replace(/\[\[\d{8}\]\]/g, "");
    const names = [...new Set(data.dongs.flatMap((d) => [displayName(d), d.EMD_NM]))].sort((a, b) => b.length - a.length);
    const re = new RegExp(`(${names.map(escapeRe).join("|")})?\\[\\[(\\d{8})\\]\\]`, "g");
    return (t: string) =>
      t
        .replace(/\[\[\d{0,8}\]?$/, "") // 스트리밍 중 잘린 토큰 숨김
        .replace(re, (m, _name, code: string) => {
          const d = data.dongByCode.get(code);
          return d ? `[${displayName(d)}](#emd-${code})` : (_name ?? "");
        });
  }, [data]);

  const mdComponents = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        if (href?.startsWith("#emd-")) {
          const code = href.slice(5);
          return (
            <button
              type="button"
              onClick={() => focusOnMap(code)}
              className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
            >
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
            {children}
          </a>
        );
      },
      p: ({ node, children }) =>
        nodeText(node as HastNode).trim().startsWith("근거:") ? (
          <p className="mt-2 text-xs text-neutral-500">{children}</p>
        ) : (
          <p className="my-1.5">{children}</p>
        ),
      table: ({ children }) => (
        <div className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-left tabular-nums">{children}</table>
        </div>
      ),
      th: ({ children }) => <th className="border-b border-neutral-300 px-2 py-1 font-semibold whitespace-nowrap">{children}</th>,
      td: ({ children }) => <td className="border-b border-neutral-100 px-2 py-1">{children}</td>,
      ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
    }),
    [focusOnMap],
  );

  const patch = (id: number, f: (m: Msg) => Msg) => setMessages((ms) => ms.map((m) => (m.id === id ? f(m) : m)));

  const send = useCallback(
    async (question: string, base: Msg[]) => {
      const q = question.trim();
      if (!q || busy) return;
      if (q.length > MAX_INPUT) return;
      const user: Msg = { id: nextId++, role: "user", text: q, tools: [], status: "done" };
      const bot: Msg = { id: nextId++, role: "assistant", text: "", tools: [], status: "streaming" };
      setMessages([...base, user, bot]);
      setInput("");
      setBusy(true);

      // 이전 대화는 정상 완료된 것만
      const history = [...base.filter((m) => m.status === "done" && m.text), user].map((m) => ({ role: m.role, content: m.text }));
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            ctx: { region, levels: [...levels], groups: [...groups], selectedEmd },
          }),
        });
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? `서버 오류 ${res.status}`);
        }
        let failed: string | null = null;
        await readSse(res, (event, d) => {
          if (event === "meta") patch(bot.id, (m) => ({ ...m, mode: d.mode as Msg["mode"] }));
          else if (event === "tool") patch(bot.id, (m) => ({ ...m, tools: [...m.tools, String(d.label ?? d.name)] }));
          else if (event === "text") patch(bot.id, (m) => ({ ...m, text: m.text + String(d.delta) }));
          else if (event === "error") failed = String(d.message);
        });
        patch(bot.id, (m) => (failed ? { ...m, status: "error", error: failed } : { ...m, status: "done" }));
      } catch (e) {
        patch(bot.id, (m) => ({ ...m, status: "error", error: (e as Error).message || "연결 오류" }));
      } finally {
        setBusy(false);
      }
    },
    [busy, region, levels, groups, selectedEmd],
  );

  const retry = (botId: number) => {
    const i = messages.findIndex((m) => m.id === botId);
    const user = messages[i - 1];
    if (!user || user.role !== "user") return;
    send(user.text, messages.slice(0, i - 1));
  };

  const chips = [
    "이번 분기 우선 동은?",
    selected ? `${displayName(selected)}은 왜 이 단계인가요?` : null,
    "HH1과 HH2는 뭐가 달라요?",
    "이 결과 얼마나 믿을 수 있어요?",
    "강남 5060 인구 많은 순으로 상위 5개",
  ].filter((c): c is string => !!c);

  if (!chatOpen) {
    return (
      <footer className="flex h-14 shrink-0 items-center gap-3 border-t border-neutral-200 bg-white px-4">
        <button
          onClick={() => setChatOpen(true)}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700"
        >
          에이전트에게 묻기 ▲
        </button>
        <span className="truncate text-neutral-500">
          {messages.length ? `대화 ${messages.filter((m) => m.role === "user").length}건` : "결과표를 근거로 답합니다. 숫자마다 출처를 표시합니다."}
        </span>
      </footer>
    );
  }

  return (
    <footer className="flex h-[360px] shrink-0 flex-col border-t border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2">
        <span className="font-semibold">에이전트 대화</span>
        <button onClick={() => setChatOpen(false)} className="text-neutral-500 hover:text-neutral-900">
          접기 ▼
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && <p className="text-neutral-500">아래 추천 질문을 누르거나 직접 물어보세요.</p>}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[75%] rounded-xl bg-neutral-900 px-3 py-2 whitespace-pre-wrap text-white">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="max-w-[85%] rounded-xl bg-[#f6f6f3] px-3 py-2">
              {m.mode === "fallback" && (
                <span className="mb-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                  (규칙 기반 답변 — AI 연결 안 됨)
                </span>
              )}
              {m.tools.map((t, i) => (
                <div key={i} className="text-xs text-neutral-400">
                  조회 중: {t}
                </div>
              ))}
              {m.text ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {linkify(m.text)}
                </ReactMarkdown>
              ) : (
                m.status === "streaming" && <div className="text-neutral-400">생각 중…</div>
              )}
              {m.status === "error" && (
                <div className="mt-1 flex items-center gap-2 text-xs text-red-700">
                  {m.error}
                  <button onClick={() => retry(m.id)} disabled={busy} className="rounded border border-red-300 px-1.5 py-0.5 hover:bg-red-50">
                    재시도
                  </button>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pb-2">
        {chips.map((c) => (
          <button
            key={c}
            disabled={busy}
            onClick={() => send(c, messages)}
            className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs hover:bg-neutral-50 disabled:opacity-40"
          >
            {c}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input, messages);
        }}
        className="flex items-end gap-2 border-t border-neutral-100 px-4 py-2"
      >
        <textarea
          ref={inputRef}
          value={input}
          maxLength={MAX_INPUT}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input, messages);
            }
          }}
          placeholder="예: 서면은 왜 5단계예요?"
          className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-1.5 focus:border-neutral-900 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="h-9 rounded-lg bg-neutral-900 px-4 text-white disabled:opacity-40"
        >
          {busy ? "답변 중" : "보내기"}
        </button>
      </form>
    </footer>
  );
}
