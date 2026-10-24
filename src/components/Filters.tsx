"use client";
// 헤더: 지역 토글 · 단계 필터 · 군집 필터 · 색 모드 · 상위 N 강조
import { GROUPS, LEVELS } from "@/lib/constants";
import { GROUP_COLOR, GROUP_NAME, LEVEL_COLOR, PRIORITY_LABEL, REGION_LABEL, textOn, type Region } from "@/lib/labels";
import { useUi } from "@/store/ui";

const REGIONS: Region[] = ["all", "11230", "32010"];

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 ${value === o.value ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ on, color, onClick, children, title }: {
  on: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className="rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums transition-opacity"
      style={on ? { background: color, borderColor: color, color: textOn(color) } : { borderColor: color, color: "#666", opacity: 0.6 }}
    >
      {children}
    </button>
  );
}

export default function Filters() {
  const { region, setRegion, levels, toggleLevel, groups, toggleGroup, colorMode, setColorMode, highlightTopN, setHighlightTopN } =
    useUi();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Segmented
        label="지역"
        value={region}
        onChange={setRegion}
        options={REGIONS.map((r) => ({ value: r, label: REGION_LABEL[r] }))}
      />

      <div className="flex items-center gap-1" aria-label="단계 필터">
        <span className="mr-1 text-xs text-neutral-500">단계</span>
        {LEVELS.map((l) => (
          <Chip key={l} on={levels.has(l)} color={LEVEL_COLOR[l]} onClick={() => toggleLevel(l)} title={PRIORITY_LABEL[l]}>
            {l}
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-1" aria-label="군집 필터">
        <span className="mr-1 text-xs text-neutral-500">군집</span>
        {GROUPS.map((g) => (
          <Chip key={g} on={groups.has(g)} color={GROUP_COLOR[g]} onClick={() => toggleGroup(g)} title={GROUP_NAME[g]}>
            {g}
          </Chip>
        ))}
      </div>

      <Segmented
        label="색 모드"
        value={colorMode}
        onChange={setColorMode}
        options={[
          { value: "level", label: "단계 색" },
          { value: "group", label: "군집 색" },
        ]}
      />

      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={highlightTopN !== null}
          onChange={(e) => setHighlightTopN(e.target.checked ? 10 : null)}
        />
        상위
        <input
          type="number"
          min={1}
          max={47}
          disabled={highlightTopN === null}
          value={highlightTopN ?? 10}
          onChange={(e) => {
            const n = Math.max(1, Math.min(47, Number(e.target.value) || 1));
            setHighlightTopN(n);
          }}
          className="w-12 rounded border border-neutral-300 bg-white px-1 py-0.5 tabular-nums disabled:opacity-40"
        />
        개 동 강조
      </label>
    </div>
  );
}
