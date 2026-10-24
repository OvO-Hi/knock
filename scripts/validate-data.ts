// 데이터 검증 (CLAUDE.md §8 0단계). 실행: npm run validate
import fs from "node:fs";
import path from "node:path";
import { DONG_COLUMNS, GROUPS, loadData, readCsv } from "../src/lib/data";
import { parseReason } from "../src/lib/reason";

const DATA = path.join(__dirname, "..", "data");
const EXPECT_GROUP = { HH1: 6, HH2: 10, HL: 11, LH: 11, LL: 9 };
const EXPECT_LEVEL = { 1: 10, 2: 9, 3: 9, 4: 9, 5: 10 };

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "✅ 통과" : "❌ 실패"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const count = (xs: (string | number)[]) =>
  xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});
const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(" ");
const same = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys({ ...a, ...b }).every((k) => a[k] === b[k]);

try {
  const { fields } = readCsv(path.join(DATA, "dong_cluster.csv"));
  const missingCols = DONG_COLUMNS.filter((c) => !fields.includes(c));
  check("dong_cluster 컬럼 25개", fields.length === 25 && missingCols.length === 0,
    missingCols.length ? `누락 ${missingCols.join(",")}` : `${fields.length}개`);

  const data = loadData(DATA);
  const { dongs } = data;
  check("dong_cluster 47행", dongs.length === 47, `${dongs.length}행`);
  check("EMD_CD 8자리·중복 없음",
    dongs.every((d) => /^\d{8}$/.test(d.EMD_CD)) && data.dongByCode.size === dongs.length);

  const g = count(dongs.map((d) => d.GROUP));
  check("GROUP 분포 HH1 6/HH2 10/HL 11/LH 11/LL 9", same(g, EXPECT_GROUP), fmt(g));

  const l = count(dongs.map((d) => d.RISK_LEVEL));
  check("RISK_LEVEL 분포 1:10/2:9/3:9/4:9/5:10", same(l, EXPECT_LEVEL), fmt(l));

  const reasons = dongs.flatMap((d) => [d.REASON_1, d.REASON_2]);
  const bad = reasons.filter((r) => parseReason(r) === null);
  check("REASON 94개 파싱", reasons.length === 94 && bad.length === 0,
    bad.length ? `실패 ${bad.length}개: ${bad.slice(0, 3).join(" | ")}` : `${reasons.length}개`);

  check("cluster_profile 5행 (GROUP 5종)",
    data.clusterProfiles.length === 5 && GROUPS.every((x) => data.clusterProfiles.some((c) => c.GROUP === x)));
  check("validation_summary 1행", !!data.validation && data.validation["실루엣 계수"] === 0.435,
    `실루엣 ${data.validation?.["실루엣 계수"]}`);
  check("sensitivity_final 6행", data.sensitivity.length === 6, `${data.sensitivity.length}행`);
  check("shap_importance 5행", data.shap.length === 5, `${data.shap.length}행`);
  check("variable_dictionary.md 로드", data.variableDictionary.length > 0);

  const geoPath = path.join(DATA, "gangnam_chuncheon_emd.geojson");
  if (!fs.existsSync(geoPath)) {
    check("GeoJSON 존재", false, "npm run build:geojson 먼저 실행");
  } else {
    const geo = JSON.parse(fs.readFileSync(geoPath, "utf8")) as {
      features: { properties: { EMD_CD?: string } }[];
    };
    const codes = geo.features.map((f) => f.properties.EMD_CD ?? "");
    const dup = codes.filter((c, i) => codes.indexOf(c) !== i);
    const noDong = codes.filter((c) => !data.dongByCode.has(c));
    const noGeo = dongs.filter((d) => !codes.includes(d.EMD_CD)).map((d) => d.EMD_NM);
    check("GeoJSON 47개 피처 · EMD_CD 1:1 조인",
      codes.length === 47 && !dup.length && !noDong.length && !noGeo.length,
      `피처 ${codes.length}` +
        (dup.length ? `, 중복 ${dup}` : "") +
        (noDong.length ? `, CSV에 없음 ${noDong}` : "") +
        (noGeo.length ? `, 경계 없음 ${noGeo}` : ""));
  }
} catch (e) {
  check("데이터 로드", false, (e as Error).message);
}

console.log(failed ? `\n${failed}개 항목 실패` : "\n모든 항목 통과");
process.exit(failed ? 1 : 0);
