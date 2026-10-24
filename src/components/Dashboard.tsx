"use client";
// 대시보드 레이아웃 (CLAUDE.md §4.1): 헤더 / 좌 55% 지도·리스트 / 우 45% 동 패널 / 하단 대화 자리
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { useDashboardData } from "@/lib/useDashboardData";
import { matchResources } from "@/lib/match";
import { matchesFilter } from "@/lib/selectors";
import { useUi } from "@/store/ui";
import Brief from "./Brief";
import Chat from "./Chat";
import DemoMenu from "./DemoMenu";
import DongList from "./DongList";
import DongPanel from "./DongPanel";
import FilterSummary from "./FilterSummary";
import PriorityPanel from "./PriorityPanel";
import SiteHeader from "./SiteHeader";
import { MapSkeleton, PanelSkeleton } from "./Skeleton";
import Toolbar from "./Toolbar";

const TAB_LABEL = { map: "지도", list: "리스트", priority: "우선 동" } as const;

const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-neutral-500">지도 불러오는 중…</div>,
});

export default function Dashboard({ initialEmd }: { initialEmd?: string }) {
  const { data, error } = useDashboardData();
  const { leftTab, setLeftTab, selectedEmd, region, levels, groups, focusOnMap } = useUi();
  const dong = selectedEmd ? data?.dongByCode.get(selectedEmd) : undefined;

  // /?emd=코드 로 들어오면 (가이드의 동 링크) 그 동을 선택하고 지도 이동 — 1회
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !data || !initialEmd) return;
    applied.current = true;
    if (data.dongByCode.has(initialEmd)) focusOnMap(initialEmd);
  }, [data, initialEmd, focusOnMap]);

  return (
    <div className="flex min-h-screen flex-col md:h-screen md:min-h-0">
      <SiteHeader current="/" right={<DemoMenu />} />
      <Toolbar />

      {/* 대화창은 오버레이라 이 영역 높이에 영향을 주지 않는다. 모바일은 접힌 바만큼 아래 여백 */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 pb-20 md:flex-row md:pb-3">
        {/* ① 지도 + 리스트 */}
        <section className="flex h-[65vh] flex-col overflow-hidden rounded-xl bg-white shadow-sm md:h-auto md:w-[55%]">
          <div role="tablist" aria-label="왼쪽 화면" className="flex gap-1 border-b border-neutral-100 px-3 pt-2">
            {(["map", "list", "priority"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={leftTab === t}
                onClick={() => setLeftTab(t)}
                className={`rounded-t-lg px-3 py-1.5 ${leftTab === t ? "border-b-2 border-neutral-900 font-semibold" : "text-neutral-500"}`}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="relative min-h-0 flex-1">
            {error && <p className="p-6 text-red-700">데이터를 불러오지 못했습니다: {error}</p>}
            {!data && !error && <MapSkeleton />}
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
                {leftTab === "priority" && (
                  <div className="absolute inset-0 z-[1100] flex flex-col bg-white">
                    <PriorityPanel />
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ② 동 상세 패널 */}
        <aside aria-label="동 상세" className="min-h-0 md:w-[45%] md:overflow-y-auto">
          {!data && !error && <PanelSkeleton />}
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

      {/* ③ 에이전트 대화 — 고정 오버레이 */}
      <Chat data={data} />
      <Brief />
    </div>
  );
}
