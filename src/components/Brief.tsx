"use client";
// 브리프 모달 (CLAUDE.md §4.5): /api/brief 결과 Markdown 표시 + 복사 + 인쇄(A4)
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toastError } from "@/store/toast";
import { useUi } from "@/store/ui";

interface BriefResponse {
  title: string;
  markdown: string;
  mode: "ai" | "fallback";
  reason?: string;
}

const md: Components = {
  h1: ({ children }) => <h1 className="mb-1 text-xl font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-1.5 border-b border-neutral-200 pb-1 text-base font-semibold">{children}</h2>,
  p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-neutral-300 bg-neutral-50 px-2 py-1 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-neutral-200 px-2 py-1 align-top">{children}</td>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
      {children}
    </a>
  ),
  hr: () => <hr className="my-4 border-neutral-200" />,
  em: ({ children }) => <em className="text-xs text-neutral-500 not-italic">{children}</em>,
};

export default function Brief() {
  const { brief, closeBrief } = useUi();
  const [data, setData] = useState<BriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!brief) return;
    setData(null);
    setError(null);
    const ac = new AbortController();
    const body = brief.kind === "dong" ? { emd_cd: brief.emd_cd } : { emd_cds: brief.emd_cds, region: brief.region, n: brief.n };
    fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ac.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `서버 오류 ${r.status}`);
        setData(j);
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError(e.message);
        toastError(`브리프를 만들지 못했습니다: ${e.message}`);
      });
    return () => ac.abort();
  }, [brief]);

  useEffect(() => {
    if (!brief) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeBrief();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [brief, closeBrief]);

  if (!brief) return null;

  const copy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return createPortal(
    <div className="brief-overlay fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 p-4" onClick={closeBrief}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="브리프"
        onClick={(e) => e.stopPropagation()}
        className="brief-dialog flex max-h-full w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"
      >
        <div className="no-print flex items-center gap-2 border-b border-neutral-200 px-4 py-2.5">
          <span className="font-semibold">{brief.kind === "dong" ? "동 브리프" : "분기 브리프"}</span>
          {data?.mode === "fallback" && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">AI 미연결(규칙 기반 요약)</span>
          )}
          <div className="ml-auto flex gap-2">
            <button disabled={!data} onClick={copy} className="rounded-lg border border-neutral-300 px-3 py-1 hover:bg-neutral-50 disabled:opacity-40">
              {copied ? "복사됨" : "복사 (Markdown)"}
            </button>
            <button disabled={!data} onClick={() => window.print()} className="rounded-lg bg-neutral-900 px-3 py-1 text-white hover:bg-neutral-700 disabled:opacity-40">
              인쇄 / PDF
            </button>
            <button onClick={closeBrief} aria-label="닫기" className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100">
              ✕
            </button>
          </div>
        </div>
        <div className="brief-print overflow-y-auto px-6 py-5">
          {error && <p className="text-red-700">브리프를 만들지 못했습니다: {error}</p>}
          {!data && !error && <p className="text-neutral-500">결과표를 조회해 브리프를 만드는 중…</p>}
          {data && (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
              {data.markdown}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
