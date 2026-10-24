"use client";
// /api/dongs · /api/geo 를 마운트 시 한 번 받아 모듈 단위로 캐시
import { useEffect, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import type { DongDTO, DongsResponse, EmdFeatureProps } from "./api-types";
import type { ClusterProfile } from "./data";

export interface DashboardData {
  dongs: DongDTO[];
  dongByCode: Map<string, DongDTO>;
  profiles: ClusterProfile[];
  geo: FeatureCollection<Geometry, EmdFeatureProps>;
}

let cache: Promise<DashboardData> | null = null;

async function load(): Promise<DashboardData> {
  const [d, geo] = await Promise.all([
    fetch("/api/dongs").then((r) => {
      if (!r.ok) throw new Error(`/api/dongs ${r.status}`);
      return r.json() as Promise<DongsResponse>;
    }),
    fetch("/api/geo").then((r) => {
      if (!r.ok) throw new Error(`/api/geo ${r.status}`);
      return r.json() as Promise<DashboardData["geo"]>;
    }),
  ]);
  return { ...d, dongByCode: new Map(d.dongs.map((x) => [x.EMD_CD, x])), geo };
}

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    cache ??= load();
    cache.then(setData, (e: Error) => {
      cache = null;
      setError(e.message);
    });
  }, []);
  return { data, error };
}
