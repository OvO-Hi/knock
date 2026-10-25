"use client";
// 동 리스트 (CLAUDE.md §4.2). 기본 정렬 = 단계↓ → 5060 인구↓
import { useMemo, useState } from "react";
import type { DongDTO } from "@/lib/api-types";
import { GROUP_COLOR, LEVEL_COLOR, displayName, fmtInt, textOn } from "@/lib/labels";
import { byPriority, matchesFilter } from "@/lib/selectors";
import { tooltipText } from "@/lib/tooltip";
import { useUi } from "@/store/ui";

type SortKey = "priority" | "name" | "region" | "level" | "group" | "total" | "pop5060" | "pop" | "reg";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "동" },
  { key: "region", label: "지역" },
  { key: "level", label: "단계", numeric: true },
  { key: "group", label: "군집" },
  { key: "total", label: "종합점수", numeric: true },
  { key: "pop5060", label: "5060 인구", numeric: true },
  { key: "pop", label: "인구축", numeric: true },
  { key: "reg", label: "지역축", numeric: true },
];

const cmp: Record<SortKey, (a: DongDTO, b: DongDTO) => number> = {
  priority: byPriority,
  name: (a, b) => displayName(a).localeCompare(displayName(b), "ko"),
  region: (a, b) => a.SGG_NM.localeCompare(b.SGG_NM, "ko") || byPriority(a, b),
  level: (a, b) => a.RISK_LEVEL - b.RISK_LEVEL || a.POP_5060 - b.POP_5060,
  group: (a, b) => a.GROUP.localeCompare(b.GROUP) || byPriority(a, b),
  total: (a, b) => a.TOTAL_SCORE - b.TOTAL_SCORE,
  pop5060: (a, b) => a.POP_5060 - b.POP_5060,
  pop: (a, b) => a.POP_SCORE - b.POP_SCORE,
  reg: (a, b) => a.REG_SCORE - b.REG_SCORE,
};

export default function DongList({ dongs }: { dongs: DongDTO[] }) {
  const { region, levels, groups, selectedEmd, focusOnMap } = useUi();
  // 숫자 컬럼은 처음 누르면 내림차순
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "priority", desc: false });

  const rows = useMemo(() => {
    const f = dongs.filter((d) => matchesFilter(d, { region, levels, groups }));
    const c = cmp[sort.key];
    return f.sort((a, b) => (sort.desc ? -c(a, b) : c(a, b)));
  }, [dongs, region, levels, groups, sort]);

  const onHeader = (key: SortKey, numeric?: boolean) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: !!numeric }));

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-left tabular-nums">
        <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e5e5e5]">
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => onHeader(c.key, c.numeric)}
                aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}
                className={`cursor-pointer px-3 py-2 font-semibold whitespace-nowrap select-none hover:bg-neutral-50 ${c.numeric ? "text-right" : ""}`}
              >
                {c.label}
                <span className="ml-0.5 text-neutral-400">{sort.key === c.key ? (sort.desc ? "▼" : "▲") : ""}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.EMD_CD}
              onClick={() => focusOnMap(d.EMD_CD)}
              className={`cursor-pointer border-b border-neutral-100 ${d.EMD_CD === selectedEmd ? "bg-amber-50" : "hover:bg-neutral-50"}`}
            >
              <td className="px-3 py-1.5 font-medium whitespace-nowrap" title={tooltipText(d)}>
                {displayName(d)}
              </td>
              <td className="px-3 py-1.5 text-neutral-600">{d.SGG_NM}</td>
              <td className="px-3 py-1.5 text-right">
                <span
                  className="inline-block min-w-6 rounded px-1.5 text-center text-xs font-semibold"
                  style={{ background: LEVEL_COLOR[d.RISK_LEVEL], color: textOn(LEVEL_COLOR[d.RISK_LEVEL]) }}
                >
                  {d.RISK_LEVEL}
                </span>
              </td>
              <td className="px-3 py-1.5">
                <span className="text-xs font-semibold" style={{ color: GROUP_COLOR[d.GROUP] }}>{d.GROUP}</span>
              </td>
              <td className="px-3 py-1.5 text-right">{d.TOTAL_SCORE.toFixed(1)}</td>
              <td className="px-3 py-1.5 text-right">{fmtInt(d.POP_5060)}</td>
              <td className="px-3 py-1.5 text-right">{d.POP_SCORE.toFixed(1)}</td>
              <td className="px-3 py-1.5 text-right">{d.REG_SCORE.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-6 text-center text-neutral-500">현재 필터에 해당하는 동이 없습니다.</p>}
    </div>
  );
}
