"use client";
// 동 미선택 시 패널: 현재 필터에 해당하는 동 수·단계 분포
import type { DongDTO } from "@/lib/api-types";
import { GROUPS, LEVELS } from "@/lib/constants";
import { GROUP_COLOR, LEVEL_COLOR, PRIORITY_LABEL, REGION_LABEL } from "@/lib/labels";
import { matchesFilter } from "@/lib/selectors";
import { useUi } from "@/store/ui";

export default function FilterSummary({ dongs }: { dongs: DongDTO[] }) {
  const { region, levels, groups } = useUi();
  const rows = dongs.filter((d) => matchesFilter(d, { region, levels, groups }));
  const max = Math.max(1, ...LEVELS.map((l) => rows.filter((d) => d.RISK_LEVEL === l).length));

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-base font-semibold">지도에서 동을 선택하세요</p>
      <p className="mt-1 text-neutral-600 tabular-nums">
        현재 필터({REGION_LABEL[region]}): <b className="text-neutral-900">{rows.length}개 동</b> / 전체 {dongs.length}개
      </p>

      <h3 className="mt-4 mb-2 text-xs font-semibold text-neutral-500">단계 분포</h3>
      <ul className="space-y-1 tabular-nums">
        {LEVELS.map((l) => {
          const n = rows.filter((d) => d.RISK_LEVEL === l).length;
          return (
            <li key={l} className="flex items-center gap-2">
              <span className="w-24 shrink-0">
                {l}단계 <span className="text-neutral-500">{PRIORITY_LABEL[l]}</span>
              </span>
              <span className="h-3 rounded-sm" style={{ width: `${(n / max) * 60}%`, background: LEVEL_COLOR[l], minWidth: n ? 4 : 0 }} />
              <span>{n}</span>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-4 mb-2 text-xs font-semibold text-neutral-500">군집 분포</h3>
      <div className="flex flex-wrap gap-2 tabular-nums">
        {GROUPS.map((g) => (
          <span key={g} className="rounded-md border px-2 py-0.5 text-xs" style={{ borderColor: GROUP_COLOR[g] }}>
            <b style={{ color: GROUP_COLOR[g] }}>{g}</b> {rows.filter((d) => d.GROUP === g).length}
          </span>
        ))}
      </div>
    </section>
  );
}
