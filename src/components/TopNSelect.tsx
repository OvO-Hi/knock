"use client";
// 우선순위 N (5~20): 지도 "상위 N 강조"와 우선순위 패널 공용
import { TOP_N_MAX, TOP_N_MIN, useUi } from "@/store/ui";

const OPTIONS = Array.from({ length: TOP_N_MAX - TOP_N_MIN + 1 }, (_, i) => TOP_N_MIN + i);

export default function TopNSelect({ disabled, label = "N" }: { disabled?: boolean; label?: string }) {
  const { topN, setTopN } = useUi();
  return (
    <select
      aria-label={label}
      value={topN}
      disabled={disabled}
      onChange={(e) => setTopN(Number(e.target.value))}
      className="rounded border border-neutral-300 bg-white px-1 py-0.5 tabular-nums disabled:opacity-40"
    >
      {OPTIONS.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
