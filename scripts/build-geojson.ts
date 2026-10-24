// vuski/admdongkor 행정동 경계에서 강남구·춘천시만 추출 → data/gangnam_chuncheon_emd.geojson
// 실행: npm run build:geojson  (원본은 data/raw/ 에 캐시, git 제외)
//
// admdongkor properties: adm_cd(통계청 8자리, 예 11230510) / adm_cd2(행안부 10자리, 예 1168051000)
// dong_cluster.csv 의 EMD_CD 는 adm_cd 와 같은 체계라 코드로 바로 조인한다.
// 코드가 안 맞는 동이 있으면 "시군구 + 동 이름"으로 매핑하고, 결과를 scripts/emd_code_map.json 에 남긴다.
import fs from "node:fs";
import path from "node:path";
import { loadData } from "../src/lib/data";

const VERSION = process.env.ADMDONG_VER ?? "ver20261001";
const URL = `https://raw.githubusercontent.com/vuski/admdongkor/master/${VERSION}/HangJeongDong_${VERSION}.geojson`;
const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw", `HangJeongDong_${VERSION}.geojson`);
const OUT = path.join(ROOT, "data", "gangnam_chuncheon_emd.geojson");
const MAP_OUT = path.join(ROOT, "scripts", "emd_code_map.json");

// admdongkor 의 sgg(행안부 5자리) → 팀 SGG_CD(통계청 5자리)
const SGG = { "11680": "11230", "51110": "32010" } as Record<string, string>;

type Coords = number | Coords[];
interface Feature {
  type: "Feature";
  properties: Record<string, string>;
  geometry: { type: string; coordinates: Coords };
}

// 소수 6자리(약 10cm)로 줄여 파일 크기 축소
const round = (c: Coords): Coords => (typeof c === "number" ? Math.round(c * 1e6) / 1e6 : c.map(round));

async function main() {
  if (!fs.existsSync(RAW)) {
    console.log(`다운로드: ${URL}`);
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`다운로드 실패 ${res.status} ${URL}`);
    fs.mkdirSync(path.dirname(RAW), { recursive: true });
    fs.writeFileSync(RAW, Buffer.from(await res.arrayBuffer()));
  } else {
    console.log(`캐시 사용: ${path.relative(ROOT, RAW)}`);
  }

  const src = JSON.parse(fs.readFileSync(RAW, "utf8")) as { features: Feature[] };
  const picked = src.features.filter((f) => f.properties.sgg in SGG);

  const { dongs } = loadData();
  const byCode = new Map(dongs.map((d) => [d.EMD_CD, d]));
  const byName = new Map(dongs.map((d) => [`${d.SGG_CD}|${d.EMD_NM}`, d]));

  const map: { EMD_CD: string; EMD_NM: string; SGG_NM: string; ADM_CD: string; ADM_CD2: string; method: string }[] = [];
  const features: Feature[] = [];
  const unmatched: string[] = [];

  for (const f of picked) {
    const p = f.properties;
    const emdNm = p.adm_nm.split(" ").at(-1)!;
    let dong = byCode.get(p.adm_cd);
    let method = "adm_cd";
    if (!dong) {
      dong = byName.get(`${SGG[p.sgg]}|${emdNm}`);
      method = "name";
    }
    if (!dong) {
      unmatched.push(`${p.adm_nm} (${p.adm_cd})`);
      continue;
    }
    map.push({ EMD_CD: dong.EMD_CD, EMD_NM: dong.EMD_NM, SGG_NM: dong.SGG_NM, ADM_CD: p.adm_cd, ADM_CD2: p.adm_cd2, method });
    features.push({
      type: "Feature",
      properties: { EMD_CD: dong.EMD_CD, EMD_NM: dong.EMD_NM, SGG_CD: dong.SGG_CD, SGG_NM: dong.SGG_NM, ADM_CD2: p.adm_cd2 },
      geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
    });
  }

  features.sort((a, b) => a.properties.EMD_CD.localeCompare(b.properties.EMD_CD));
  map.sort((a, b) => a.EMD_CD.localeCompare(b.EMD_CD));

  fs.writeFileSync(
    OUT,
    JSON.stringify({ type: "FeatureCollection", name: `gangnam_chuncheon_emd (admdongkor ${VERSION})`, features }),
  );
  fs.writeFileSync(MAP_OUT, JSON.stringify({ source: URL, mapping: map }, null, 2) + "\n");

  const byMethod = map.reduce<Record<string, number>>((a, m) => ((a[m.method] = (a[m.method] ?? 0) + 1), a), {});
  console.log(`추출 ${picked.length}개 → 조인 ${features.length}개`, byMethod);
  if (unmatched.length) console.log("dong_cluster 에 없는 피처:", unmatched);
  const missing = dongs.filter((d) => !features.some((f) => f.properties.EMD_CD === d.EMD_CD));
  if (missing.length) console.log("경계 없는 동:", missing.map((d) => `${d.EMD_NM}(${d.EMD_CD})`));
  console.log(`저장: ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
