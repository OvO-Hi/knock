"use client";
// 행정동 위험도 지도 (CLAUDE.md §4.2). Dashboard 에서 dynamic import(ssr: false)로 불러온다.
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { AttributionControl, GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { Feature, Geometry } from "geojson";
import type { DashboardData } from "@/lib/useDashboardData";
import type { EmdFeatureProps } from "@/lib/api-types";
import { GROUP_COLOR, LEVEL_COLOR, displayName } from "@/lib/labels";
import { matchesFilter, topN } from "@/lib/selectors";
import { useUi } from "@/store/ui";
import Legend from "./Legend";

type EmdFeature = Feature<Geometry, EmdFeatureProps>;

const INACTIVE: L.PathOptions = { fillColor: "#ddd", fillOpacity: 0.3, color: "#bbb", weight: 1, opacity: 0.3 };
// 초기 스타일. 렌더마다 새 함수를 넘기면 react-leaflet 이 setStyle 로 덮어쓰므로 모듈 상수로 둔다
const initialStyle = () => INACTIVE;

export default function Map({ data }: { data: DashboardData }) {
  const geoRef = useRef<L.GeoJSON | null>(null);
  const layers = useRef(new globalThis.Map<string, L.Path>());

  return (
    <div className="relative h-full w-full">
      {/* 저작권 표시는 오른쪽 위 — 하단 중앙의 대화 바·좌하단 범례와 겹치지 않게 */}
      <MapContainer center={[37.7, 127.4]} zoom={9} className="h-full w-full" zoomControl attributionControl={false} preferCanvas={false}>
        <AttributionControl position="topright" prefix='<a href="https://leafletjs.com">Leaflet</a>' />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <DongLayer data={data} geoRef={geoRef} layers={layers} />
      </MapContainer>
      <Legend />
      <EmptyNotice data={data} />
    </div>
  );
}

function DongLayer({
  data,
  geoRef,
  layers,
}: {
  data: DashboardData;
  geoRef: React.RefObject<L.GeoJSON | null>;
  layers: React.RefObject<globalThis.Map<string, L.Path>>;
}) {
  const map = useMap();
  const { region, levels, groups, colorMode, topN: n, highlightOn, selectedEmd, focus, leftTab, select } = useUi();

  const active = useMemo(() => {
    const f = { region, levels, groups };
    const pass = new Set(data.dongs.filter((d) => matchesFilter(d, f)).map((d) => d.EMD_CD));
    return highlightOn ? topN(data.dongs, f, n) : pass;
  }, [data.dongs, region, levels, groups, highlightOn, n]);

  // 이벤트 핸들러는 한 번만 바인딩되므로 최신 값은 ref 로 읽는다
  const activeRef = useRef(active);
  activeRef.current = active;
  const selectRef = useRef(select);
  selectRef.current = select;

  const onEachFeature = (feature: EmdFeature, layer: L.Layer) => {
    const code = feature.properties.EMD_CD;
    const d = data.dongByCode.get(code);
    layers.current.set(code, layer as L.Path);
    const label = d ? `${displayName(d)} ${d.RISK_LEVEL}단계 ${d.GROUP}` : feature.properties.EMD_NM;
    if (d) layer.bindTooltip(`${displayName(d)} · ${d.RISK_LEVEL}단계 · ${d.GROUP}`, { sticky: true });
    layer.on("click", () => {
      if (activeRef.current.has(code)) selectRef.current(code);
    });
    // 접근성: SVG path 에 이름표 + 키보드 선택 (path 는 레이어가 지도에 붙을 때 생긴다)
    layer.on("add", () => {
      const el = (layer as L.Path).getElement();
      if (!el) return;
      el.setAttribute("aria-label", label);
      el.setAttribute("role", "button");
      el.addEventListener("keydown", (e) => {
        const k = (e as KeyboardEvent).key;
        if ((k === "Enter" || k === " ") && activeRef.current.has(code)) {
          e.preventDefault();
          selectRef.current(code);
        }
      });
    });
  };

  // 색·테두리·클릭 가능 여부
  useEffect(() => {
    for (const [code, layer] of layers.current) {
      const d = data.dongByCode.get(code);
      const isActive = !!d && active.has(code);
      if (!d || !isActive) {
        layer.setStyle(INACTIVE);
      } else {
        const fill = colorMode === "level" ? LEVEL_COLOR[d.RISK_LEVEL] : GROUP_COLOR[d.GROUP];
        const selected = code === selectedEmd;
        layer.setStyle({
          fillColor: fill,
          fillOpacity: 0.65,
          color: selected ? "#111" : "#fff",
          weight: selected ? 3 : 1,
          opacity: 1,
        });
        if (selected) layer.bringToFront();
      }
      const el = layer.getElement() as HTMLElement | SVGElement | undefined;
      if (el) {
        el.style.cursor = isActive ? "pointer" : "default";
        // 필터 밖 동은 탭 순서에서 뺀다
        el.setAttribute("tabindex", isActive ? "0" : "-1");
        el.setAttribute("aria-disabled", String(!isActive));
      }
    }
  }, [active, colorMode, selectedEmd, data.dongByCode, layers]);

  // 지역 토글 → fitBounds
  useEffect(() => {
    const b = L.latLngBounds([]);
    for (const [code, layer] of layers.current) {
      if (region === "all" || code.startsWith(region)) b.extend((layer as L.Polygon).getBounds());
    }
    if (b.isValid()) map.fitBounds(b, { padding: [16, 16] });
  }, [region, map, layers]);

  // 리스트·패널에서 "지도에서 보기" → flyTo
  useEffect(() => {
    if (!focus) return;
    const layer = layers.current.get(focus.emd) as L.Polygon | undefined;
    if (!layer) return;
    map.invalidateSize();
    // 대화창 오버레이가 지도 아래쪽을 가리면 그만큼 아래 여백을 줘서 대화창 위쪽 영역 중앙으로
    let hidden = 0;
    const chat = document.querySelector("[data-chat-overlay]")?.getBoundingClientRect();
    const box = map.getContainer().getBoundingClientRect();
    if (chat && chat.left < box.right && chat.right > box.left && chat.top < box.bottom) {
      hidden = Math.min(box.bottom - Math.max(chat.top, box.top), box.height - 120);
    }
    map.flyToBounds(layer.getBounds(), {
      maxZoom: 14,
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, 40 + Math.max(0, hidden)],
      duration: 0.8,
    });
  }, [focus, map, layers]);

  // 리스트 탭에서 돌아올 때 크기 재계산
  useEffect(() => {
    if (leftTab === "map") map.invalidateSize();
  }, [leftTab, map]);

  // 대화창 높이 조절·창 크기 변경 등으로 지도 영역이 바뀌면 크기 재계산
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize({ debounceMoveend: true }));
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);

  return (
    <GeoJSON ref={geoRef} data={data.geo} onEachFeature={onEachFeature} style={initialStyle} />
  );
}

/** 필터 결과 0건 안내 */
function EmptyNotice({ data }: { data: DashboardData }) {
  const { region, levels, groups } = useUi();
  const n = data.dongs.filter((d) => matchesFilter(d, { region, levels, groups })).length;
  if (n > 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 z-[1000] flex justify-center">
      <p className="rounded-full bg-white/95 px-4 py-1.5 text-[13px] text-neutral-700 shadow">
        현재 필터에 해당하는 동이 없습니다. 단계·군집 필터를 넓혀 보세요.
      </p>
    </div>
  );
}
