"use client";
// "이번 분기 우선 동" (CLAUDE.md §4.2 우선순위 보기). prioritize 도구 결과를 그대로 보여준다.
import { useEffect, useState } from "react";
import { FLAGS, type Flag, type Group } from "@/lib/constants";
import { GROUP_COLOR, LEVEL_COLOR, REGION_LABEL, fmtInt, textOn } from "@/lib/labels";
import { toastError } from "@/store/toast";
import { tooltipText } from "@/lib/tooltip";
import { useDashboardData } from "@/lib/useDashboardData";
import { useUi } from "@/store/ui";
import TopNSelect from "./TopNSelect";

interface PriorityRow {
  순서: number;
  EMD_CD: string;
  이름: string;
  지역: string;
  RISK_LEVEL: 1 | 2 | 3 | 4 | 5;
  GROUP: Group;
  SUBTYPE_NM: string | null;
  POP_5060: number;
  FLAGS: Flag[];
  선정_이유: string;
}

type AdminType = "" | "읍면" | "동";

export default function PriorityPanel() {
  const { region, topN, selectedEmd, select, openBrief } = useUi();
  const { data } = useDashboardData();
  const [adminType, setAdminType] = useState<AdminType>("");
  const [exclude, setExclude] = useState<Flag[]>([]);
  const [rows, setRows] = useState<PriorityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ n: String(topN) });
    if (region !== "all") q.set("region", region);
    if (adminType) q.set("admin_type", adminType);
    exclude.forEach((f) => q.append("exclude_flags", f));
    const ac = new AbortController();
    fetch(`/api/prioritize?${q}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setRows(j.data.우선_동);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError(e.message);
        toastError(`우선 동을 불러오지 못했습니다: ${e.message}`);
      });
    return () => ac.abort();
  }, [region, topN, adminType, exclude]);

  const toggle = (f: Flag) => setExclude((xs) => (xs.includes(f) ? xs.filter((x) => x !== f) : [...xs, f]));

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#fbfbf9]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2">
        <h3 className="font-semibold">이번 분기 우선 동</h3>
        <span className="text-xs text-neutral-500">{REGION_LABEL[region]} · 단계↓ → 50·60대 인구↓</span>
        <label className="flex items-center gap-1 text-xs">
          상위 <TopNSelect label="우선 동 수" />곳
        </label>
        <div className="flex rounded-md border border-neutral-300 bg-white text-xs">
          {(["", "읍면", "동"] as AdminType[]).map((t) => (
            <button
              key={t || "all"}
              onClick={() => setAdminType(t)}
              className={`px-2 py-0.5 ${adminType === t ? "bg-neutral-900 text-white" : ""} first:rounded-l-md last:rounded-r-md`}
            >
              {t || "전체"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-500">제외</span>
          {FLAGS.map((f) => (
            <label key={f} className="flex items-center gap-0.5">
              <input type="checkbox" checked={exclude.includes(f)} onChange={() => toggle(f)} />
              {f}
            </label>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3">
        {error && <p className="py-2 text-red-700">{error}</p>}
        {rows && (
          <table className="w-full text-left text-[13px] tabular-nums">
            <thead className="sticky top-0 bg-[#fbfbf9] text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-2 font-normal">순위</th>
                <th className="py-1 pr-2 font-normal">동</th>
                <th className="py-1 pr-2 font-normal">단계</th>
                <th className="py-1 pr-2 font-normal">군집</th>
                <th className="py-1 pr-2 font-normal">하위유형</th>
                <th className="py-1 pr-2 text-right font-normal">5060 인구</th>
                <th className="py-1 font-normal">선정 이유</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.EMD_CD}
                  onClick={() => select(r.EMD_CD)}
                  className={`cursor-pointer border-t border-neutral-100 ${r.EMD_CD === selectedEmd ? "bg-amber-50" : "hover:bg-white"}`}
                >
                  <td className="py-1 pr-2">{r.순서}</td>
                  <td
                    className="py-1 pr-2 font-medium whitespace-nowrap"
                    title={data?.dongByCode.get(r.EMD_CD) ? tooltipText(data.dongByCode.get(r.EMD_CD)!) : undefined}
                  >
                    {r.이름}
                    {r.FLAGS.length > 0 && <span className="ml-1 text-[10px] text-neutral-500">{r.FLAGS.join("·")}</span>}
                  </td>
                  <td className="py-1 pr-2">
                    <span className="rounded px-1.5 text-xs font-semibold" style={{ background: LEVEL_COLOR[r.RISK_LEVEL], color: textOn(LEVEL_COLOR[r.RISK_LEVEL]) }}>
                      {r.RISK_LEVEL}
                    </span>
                  </td>
                  <td className="py-1 pr-2 text-xs font-semibold" style={{ color: GROUP_COLOR[r.GROUP] }}>
                    {r.GROUP}
                  </td>
                  <td className="py-1 pr-2 text-xs text-neutral-600">{r.SUBTYPE_NM}</td>
                  <td className="py-1 pr-2 text-right">{fmtInt(r.POP_5060)}</td>
                  <td className="py-1 text-xs text-neutral-600">{r.선정_이유}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows?.length === 0 && <p className="py-2 text-neutral-500">조건에 맞는 동이 없습니다.</p>}
      </div>

      <div className="flex justify-end border-t border-neutral-200 px-3 py-2">
        <button
          disabled={!rows?.length}
          onClick={() =>
            rows &&
            openBrief({ kind: "quarter", emd_cds: rows.map((r) => r.EMD_CD), region: region === "all" ? undefined : region, n: rows.length })
          }
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          분기 브리프 만들기
        </button>
      </div>
    </section>
  );
}
