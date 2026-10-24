"use client";
// 대시보드 레이아웃 (CLAUDE.md §4.1): 헤더 / 좌 55% 지도·리스트 / 우 45% 동 패널 / 하단 대화 자리
import dynamic from "next/dynamic";
import { useDashboardData } from "@/lib/useDashboardData";
import { matchResources, matchesFilter } from "@/lib/selectors";
import { useUi } from "@/store/ui";
import Filters from "./Filters";
import DongList from "./DongList";
import DongPanel from "./DongPanel";
import FilterSummary from "./FilterSummary";

const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-neutral-500">지도 불러오는 중…</div>,
});

export default function Dashboard() {
  const { data, error } = useDashboardData();
  const { leftTab, setLeftTab, selectedEmd, region, levels, groups } = useUi();
  const dong = selectedEmd ? data?.dongByCode.get(selectedEmd) : undefined;

  return (
    <div className="flex min-h-screen flex-col md:h-screen md:min-h-0">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-neutral-200 bg-white px-4 py-2.5">
        <h1 className="text-base font-bold whitespace-nowrap">
          노크 KNOCK <span className="font-normal text-neutral-500">· 중장년 고립 위험 지도</span>
        </h1>
        <Filters />
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row">
        {/* ① 지도 + 리스트 */}
        <section className="flex h-[65vh] flex-col overflow-hidden rounded-xl bg-white shadow-sm md:h-auto md:w-[55%]">
          <div role="tablist" className="flex gap-1 border-b border-neutral-100 px-3 pt-2">
            {(["map", "list"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={leftTab === t}
                onClick={() => setLeftTab(t)}
                className={`rounded-t-lg px-3 py-1.5 ${leftTab === t ? "border-b-2 border-neutral-900 font-semibold" : "text-neutral-500"}`}
              >
                {t === "map" ? "지도" : "리스트"}
              </button>
            ))}
          </div>
          <div className="relative min-h-0 flex-1">
            {error && <p className="p-6 text-red-700">데이터를 불러오지 못했습니다: {error}</p>}
            {data && (
              <>
                {/* 지도는 계속 마운트해 두고 리스트를 위에 덮는다 (Leaflet 크기·상태 유지) */}
                <div className="absolute inset-0">
                  <Map data={data} />
                </div>
                {leftTab === "list" && (
                  <div className="absolute inset-0 z-[1100] bg-white">
                    <DongList dongs={data.dongs} />
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ② 동 상세 패널 */}
        <aside className="min-h-0 md:w-[45%] md:overflow-y-auto">
          {data &&
            (dong ? (
              <DongPanel
                dong={dong}
                profile={data.profiles.find((p) => p.GROUP === dong.GROUP)}
                inFilter={matchesFilter(dong, { region, levels, groups })}
                rule={dong.subtype ? data.ruleById.get(dong.subtype.SUBTYPE_ID) : undefined}
                policy={data.levelPolicy.find((l) => l.RISK_LEVEL === dong.RISK_LEVEL)}
                resources={matchResources(dong, data.resources)}
              />
            ) : (
              <FilterSummary dongs={data.dongs} />
            ))}
        </aside>
      </main>

      {/* ③ 에이전트 대화 — 4단계에서 구현 */}
      <footer className="flex h-14 shrink-0 items-center border-t border-neutral-200 bg-white px-4 text-neutral-500">
        에이전트에게 묻기 (준비 중)
      </footer>
    </div>
  );
}
