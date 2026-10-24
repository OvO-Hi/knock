"use client";
// 행정동 위험도 지도 (CLAUDE.md §4.2). Dashboard 에서 dynamic import(ssr: false)로 불러온다.
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
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
      <MapContainer center={[37.7, 127.4]} zoom={9} className="h-full w-full" zoomControl preferCanvas={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <DongLayer data={data} geoRef={geoRef} layers={layers} />
      </MapContainer>
      <Legend />
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
    if (d) layer.bindTooltip(`${displayName(d)} · ${d.RISK_LEVEL}단계 · ${d.GROUP}`, { sticky: true });
    layer.on("click", () => {
      if (activeRef.current.has(code)) selectRef.current(code);
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
      if (el) el.style.cursor = isActive ? "pointer" : "default";
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
    map.flyToBounds(layer.getBounds(), { maxZoom: 14, padding: [40, 40], duration: 0.8 });
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
