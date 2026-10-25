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
  mode?: "ai" | "fallback" | "cache";
  /** 사후 검사로 고친 위반 수 */
  guardFixed?: number;
  status: "streaming" | "done" | "error";
  error?: string;
}

let nextId = 1;
const MAX_INPUT = 2000;
const DEFAULT_H = 360;
const MIN_H = 200;
const H_KEY = "knock.chatHeight";
const POS_KEY = "knock.chatPos";

type ChatPos = "left" | "center" | "right";
const POS_LABEL: Record<ChatPos, string> = { left: "⇤ 왼쪽", center: "가운데", right: "오른쪽 ⇥" };
// 720px 이상에서만 좌·중·우 정렬 (그 아래는 전체 폭)
const POS_CLASS: Record<ChatPos, string> = {
  left: "min-[720px]:left-3",
  center: "min-[720px]:left-1/2 min-[720px]:-translate-x-1/2",
  right: "min-[720px]:right-3",
};

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

/** 최대 높이 = 화면 − (헤더+툴바) − 40px */
const maxHeight = () => {
  const top = document.querySelector("main")?.getBoundingClientRect().top ?? 90;
  return Math.max(MIN_H, window.innerHeight - top - 40);
};
const clampH = (h: number) => Math.round(Math.max(MIN_H, Math.min(maxHeight(), h)));

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
  const { chatOpen, setChatOpen, chatDraft, region, levels, groups, selectedEmd, focusOnMap, demo, brief } = useUi();
  const [height, setHeight] = useState(DEFAULT_H);
  const [pos, setPos] = useState<ChatPos>("center");
  const [unread, setUnread] = useState(false);

  // 저장된 높이·위치 복원 (localStorage 는 실패할 수 있다)
  useEffect(() => {
    const h = Number(read(H_KEY));
    if (h) setHeight(clampH(h));
    const p = read(POS_KEY);
    if (p === "left" || p === "center" || p === "right") setPos(p);
  }, []);
  const saveHeight = (h: number) => {
    setHeight(h);
    write(H_KEY, String(h));
  };
  const savePos = (p: ChatPos) => {
    setPos(p);
    write(POS_KEY, p);
  };

  // 펼치면 안 읽음 해제
  useEffect(() => {
    if (chatOpen) setUnread(false);
  }, [chatOpen]);

  // Esc 로 접기 (브리프 모달·필터 시트가 열려 있으면 그쪽이 먼저)
  useEffect(() => {
    if (!chatOpen || brief) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setChatOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen, brief, setChatOpen]);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    let last = startH;
    const move = (ev: PointerEvent) => {
      last = clampH(startH + (startY - ev.clientY));
      setHeight(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      saveHeight(last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const [messages, setMessages] = useState<Msg[]>([]);
  // 데모 시나리오가 바뀌면 새 대화로
  const [demoId, setDemoId] = useState<string | null>(null);
  if ((demo?.id ?? null) !== demoId) {
    setDemoId(demo?.id ?? null);
    if (demo) setMessages([]);
  }
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
          else if (event === "final") patch(bot.id, (m) => ({ ...m, text: String(d.text) }));
          else if (event === "guard")
            patch(bot.id, (m) => ({ ...m, guardFixed: Array.isArray(d.violations) ? d.violations.length : 0 }));
          else if (event === "error") failed = String(d.message);
        });
        patch(bot.id, (m) => (failed ? { ...m, status: "error", error: failed } : { ...m, status: "done" }));
        if (!useUi.getState().chatOpen) setUnread(true);
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

  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.text));
  const chips = demo
    ? demo.questions
    : [
    "이번 분기 우선 동은?",
    selected ? `${displayName(selected)}은 왜 이 단계인가요?` : null,
    "HH1과 HH2는 뭐가 달라요?",
    "이 결과 얼마나 믿을 수 있어요?",
    "강남 5060 인구 많은 순으로 상위 5개",
  ].filter((c): c is string => !!c);

  if (!chatOpen) {
    const count = messages.filter((m) => m.role === "user").length;
    return (
      <button
        onClick={() => setChatOpen(true)}
        aria-label={`에이전트에게 묻기${unread ? " (새 답변 있음)" : ""}`}
        className="fixed bottom-3 left-1/2 z-[1200] flex h-12 w-[min(520px,calc(100vw-24px))] -translate-x-1/2 items-center gap-3 rounded-full border border-neutral-200 bg-white px-5 text-left shadow-[0_8px_30px_rgba(0,0,0,0.18)] hover:bg-neutral-50"
      >
        <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neutral-900 text-xs text-white">
          ▲
          {unread && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-600" />}
        </span>
        <span className="font-semibold">에이전트에게 묻기</span>
        <span className="truncate text-[13px] text-neutral-500">
          · {demo ? `데모 ${demo.id} 질문 보기` : count ? `대화 ${count}건 이어보기` : "추천 질문 보기"}
        </span>
      </button>
    );
  }

  return (
    <section
      data-chat-overlay="open"
      aria-label="에이전트 대화"
      style={{ height }}
      className={`fixed bottom-0 z-[1200] flex w-full flex-col overflow-hidden rounded-t-2xl border border-neutral-200 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.22)] max-[719px]:inset-x-0 min-[720px]:bottom-3 min-[720px]:w-[640px] min-[720px]:rounded-2xl ${POS_CLASS[pos]}`}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="대화창 높이 조절 (더블클릭: 기본 높이)"
        title="드래그해서 높이 조절 · 더블클릭하면 기본 높이"
        onPointerDown={startDrag}
        onDoubleClick={() => saveHeight(clampH(DEFAULT_H))}
        className="flex h-3 w-full shrink-0 cursor-ns-resize touch-none items-center justify-center"
      >
        <span className="h-1 w-12 rounded-full bg-neutral-300" />
      </div>
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 pb-2">
        <span className="font-semibold">에이전트 대화</span>
        <div role="group" aria-label="대화창 위치" className="ml-auto hidden rounded-md border border-neutral-200 text-[11px] min-[720px]:flex">
          {(["left", "center", "right"] as ChatPos[]).map((p) => (
            <button
              key={p}
              aria-pressed={pos === p}
              onClick={() => savePos(p)}
              className={`px-2 py-0.5 first:rounded-l-md last:rounded-r-md ${pos === p ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              {POS_LABEL[p]}
            </button>
          ))}
        </div>
        <button onClick={() => setChatOpen(false)} title="접기 (Esc)" className="ml-2 text-[13px] text-neutral-500 hover:text-neutral-900 max-[719px]:ml-auto">
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
              {m.mode === "cache" && (
                <span className="mb-1 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-800">(데모 캐시 답변)</span>
              )}
              {!!m.guardFixed && m.status === "done" && (
                <span className="mb-1 ml-1 inline-block rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-700">
                  결과표 대조로 {m.guardFixed}건 수정
                </span>
              )}
              {m.mode === "fallback" && (
                <span className="mb-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                  (규칙 기반 답변, AI 연결 안 됨)
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
        {demo && <span className="self-center text-xs font-semibold text-sky-800">데모 {demo.id} 질문:</span>}
        {chips.map((c, i) => (
          <button
            key={c}
            disabled={busy}
            onClick={() => send(c, messages)}
            className={`rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-40 ${
              demo
                ? asked.has(c)
                  ? "border-neutral-200 text-neutral-400"
                  : "border-sky-400 bg-sky-50 text-sky-900 hover:bg-sky-100"
                : "border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            {demo ? `${i + 1}. ${c}` : c}
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
    </section>
  );
}
