"use client";
// 헤더 아래 얇은 툴바: 지역·단계·군집·색 모드·N. 모바일(<768)은 "필터" 버튼 하나로 접고 시트로 연다.
import { useEffect, useState } from "react";
import { REGION_LABEL } from "@/lib/labels";
import { useUi } from "@/store/ui";
import Filters from "./Filters";

export default function Toolbar() {
  const [open, setOpen] = useState(false);
  const { region, levels, groups } = useUi();
  const summary = [
    REGION_LABEL[region],
    levels.size < 5 ? `${[...levels].sort((a, b) => b - a).join("·")}단계` : null,
    groups.size < 5 ? [...groups].join("·") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="hidden shrink-0 border-b border-neutral-200 bg-white/80 px-4 py-1.5 md:block">
        <Filters />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-4 py-1.5 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="rounded-lg border border-neutral-300 px-3 py-1 text-[13px] font-medium"
        >
          필터
        </button>
        <span className="truncate text-xs text-neutral-500">{summary}</span>
      </div>

      {open && (
        <div className="fixed inset-0 z-[2500] md:hidden" role="dialog" aria-modal="true" aria-label="필터">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold">필터</span>
              <button onClick={() => setOpen(false)} className="rounded-lg bg-neutral-900 px-3 py-1 text-[13px] text-white">
                적용
              </button>
            </div>
            <Filters stacked />
          </div>
        </div>
      )}
    </>
  );
}
