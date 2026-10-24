"use client";
import { GROUPS, LEVELS } from "@/lib/constants";
import { GROUP_COLOR, GROUP_NAME, LEVEL_COLOR, PRIORITY_LABEL } from "@/lib/labels";
import { useUi } from "@/store/ui";

export default function Legend() {
  const colorMode = useUi((s) => s.colorMode);
  const items =
    colorMode === "level"
      ? LEVELS.map((l) => ({ key: String(l), color: LEVEL_COLOR[l], text: `${l}단계 ${PRIORITY_LABEL[l]}` }))
      : GROUPS.map((g) => ({ key: g, color: GROUP_COLOR[g], text: `${g} ${GROUP_NAME[g]}` }));

  return (
    <div className="pointer-events-none absolute right-3 bottom-6 z-[1000] rounded-xl bg-white/95 px-3 py-2 text-xs shadow">
      <div className="mb-1 font-semibold">{colorMode === "level" ? "위험도 단계" : "군집 유형"}</div>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-2">
            <span className="inline-block h-3 w-4 rounded-sm" style={{ background: it.color, opacity: 0.85 }} />
            {it.text}
          </li>
        ))}
        <li className="flex items-center gap-2 text-neutral-500">
          <span className="inline-block h-3 w-4 rounded-sm bg-[#ddd]" />
          필터 밖
        </li>
      </ul>
    </div>
  );
}
