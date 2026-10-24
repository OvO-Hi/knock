"use client";
// 동 상세 패널의 "권장 조치"·"연결 가능한 자원" (CLAUDE.md §4.3)
import { useState } from "react";
import type { InterventionRule, WelfareResource } from "@/lib/data";

const DETAIL_KEYS = ["DETAIL_1", "DETAIL_2", "DETAIL_3", "DETAIL_4", "DETAIL_5"] as const;
const DEFAULT_SHOWN = 2;

export function RecommendedActions({ rule }: { rule?: InterventionRule }) {
  const [open, setOpen] = useState(false);
  if (!rule) return <p className="text-neutral-500">대응 규칙이 없습니다 (intervention_rules.csv)</p>;

  const details = DETAIL_KEYS.map((k) => rule[k]).filter(Boolean);
  const shown = open ? details : details.slice(0, DEFAULT_SHOWN);

  return (
    <div className="space-y-2">
      {rule.CORE_ACTION ? (
        <p className="font-semibold">{rule.CORE_ACTION}</p>
      ) : (
        <p className="text-neutral-500">핵심 대응: 문서에 기재 없음</p>
      )}
      {details.length > 0 && (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-neutral-800">
            {shown.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
          {details.length > DEFAULT_SHOWN && (
            <button onClick={() => setOpen((v) => !v)} className="text-xs text-neutral-600 underline underline-offset-2">
              {open ? "접기" : `더 보기 (${details.length - DEFAULT_SHOWN}개)`}
            </button>
          )}
        </>
      )}
      {rule.LINK_PROGRAM && (
        <p>
          <span className="text-neutral-500">기존 사업 연계:</span> {rule.LINK_PROGRAM}
        </p>
      )}
      {rule.EVIDENCE && <p className="text-xs text-neutral-500">근거: {rule.EVIDENCE}</p>}
    </div>
  );
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export function ResourceList({ resources, emdCd }: { resources: WelfareResource[]; emdCd: string }) {
  if (!resources.length) return <p className="text-neutral-500">등록된 자원이 없습니다 (welfare_resources.csv)</p>;
  return (
    <ul className="space-y-2">
      {resources.map((r) => {
        const urls = r.SOURCE_URL.split(";").map((u) => u.trim()).filter(Boolean);
        return (
          <li key={r.RES_ID} className="rounded-lg border border-neutral-200 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {r.EMD_CD === emdCd && (
                <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[11px] font-semibold text-white">이 동 사업</span>
              )}
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-700">{r.TYPE}</span>
              <span className="text-[11px] text-neutral-500">{r.SCOPE}</span>
            </div>
            <p className="mt-1 font-semibold">{r.NAME}</p>
            {r.TARGET && <p className="text-xs text-neutral-600">대상: {r.TARGET}</p>}
            {r.SUMMARY && <p className="mt-1">{r.SUMMARY}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
              {r.PROVIDER && <span>{r.PROVIDER}</span>}
              {r.PERIOD && <span className="tabular-nums">{r.PERIOD}</span>}
              {urls.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline underline-offset-2">
                  출처{urls.length > 1 ? ` ${i + 1}` : ""} ({hostOf(u)})
                </a>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
