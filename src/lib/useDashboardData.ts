"use client";
// /api/dongs · /api/geo 를 마운트 시 한 번 받아 모듈 단위로 캐시
import { useEffect, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import type { DongDTO, DongsResponse, EmdFeatureProps, ResourcesResponse, RulesResponse } from "./api-types";
import type { ClusterProfile, InterventionRule, LevelPolicy, WelfareResource } from "./data";
import { toastError } from "@/store/toast";

export interface DashboardData {
  dongs: DongDTO[];
  dongByCode: Map<string, DongDTO>;
  profiles: ClusterProfile[];
  geo: FeatureCollection<Geometry, EmdFeatureProps>;
  ruleById: Map<string, InterventionRule>;
  levelPolicy: LevelPolicy[];
  resources: WelfareResource[];
}

let cache: Promise<DashboardData> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json() as Promise<T>;
}

async function load(): Promise<DashboardData> {
  const [d, geo, rules, res] = await Promise.all([
    getJson<DongsResponse>("/api/dongs"),
    getJson<DashboardData["geo"]>("/api/geo"),
    getJson<RulesResponse>("/api/rules"),
    getJson<ResourcesResponse>("/api/resources"),
  ]);
  return {
    ...d,
    dongByCode: new Map(d.dongs.map((x) => [x.EMD_CD, x])),
    geo,
    ruleById: new Map(rules.rules.map((r) => [r.SUBTYPE_ID, r])),
    levelPolicy: rules.levelPolicy,
    resources: res.resources,
  };
}

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    cache ??= load();
    cache.then(setData, (e: Error) => {
      cache = null;
      setError(e.message);
      toastError(`데이터를 불러오지 못했습니다 (${e.message}). 새로고침해 주세요.`);
    });
  }, []);
  return { data, error };
}
