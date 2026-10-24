// 데이터 검증 (CLAUDE.md §8 0단계). 실행: npm run validate
import fs from "node:fs";
import path from "node:path";
import { DONG_COLUMNS, GROUPS, loadData, parseFlags, readCsv } from "../src/lib/data";
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

  // --- 에이전트용 데이터 (§3.2) ---
  const subCodes = data.subtypes.map((s) => s.EMD_CD);
  const subNoDong = subCodes.filter((c) => !data.dongByCode.has(c));
  const dongNoSub = dongs.filter((d) => !data.subtypeByCode.has(d.EMD_CD)).map((d) => d.EMD_NM);
  check("dong_subtype 47행 · EMD_CD 전부 dong_cluster와 일치",
    data.subtypes.length === 47 && data.subtypeByCode.size === 47 && !subNoDong.length && !dongNoSub.length,
    `${data.subtypes.length}행` +
      (subNoDong.length ? `, dong_cluster에 없음 ${subNoDong}` : "") +
      (dongNoSub.length ? `, 하위유형 없음 ${dongNoSub}` : ""));

  const ruleIds = new Set(data.rules.map((r) => r.SUBTYPE_ID));
  const noRule = [...new Set(data.subtypes.map((s) => s.SUBTYPE_ID))].filter((id) => !ruleIds.has(id));
  check("모든 SUBTYPE_ID가 intervention_rules에 존재", !noRule.length && ruleIds.size === data.rules.length,
    noRule.length ? `규칙 없음 ${noRule}` : `하위유형 ${ruleIds.size}종`);

  const groupMismatch = data.subtypes.filter((s) => {
    const d = data.dongByCode.get(s.EMD_CD);
    const r = data.rules.find((x) => x.SUBTYPE_ID === s.SUBTYPE_ID);
    return !d || !r || r.GROUP !== d.GROUP;
  });
  check("하위유형 GROUP = 동 GROUP", !groupMismatch.length, groupMismatch.map((s) => s.EMD_CD).join(","));

  const badFlag = data.subtypes.filter((s) => s.FLAG && parseFlags(s.FLAG).length !== s.FLAG.split(";").length);
  const boundaryMiss = dongs.filter(
    (d) => (d.P_OWN < 0.5) !== parseFlags(data.subtypeByCode.get(d.EMD_CD)?.FLAG ?? "").includes("경계"),
  );
  check("FLAG 값 유효 · 경계 = P_OWN<0.5", !badFlag.length && !boundaryMiss.length,
    [...badFlag.map((s) => `잘못된 FLAG ${s.EMD_CD}`), ...boundaryMiss.map((d) => `경계 불일치 ${d.EMD_NM}`)].join(", "));

  const lv = data.levelPolicy.map((l) => l.RISK_LEVEL).sort().join(",");
  check("level_policy 5행 (1~5)", lv === "1,2,3,4,5", lv);

  const noSource = data.resources.filter((r) => !r.SOURCE_URL.trim());
  const badUrl = data.resources.filter((r) => r.SOURCE_URL.split(";").some((u) => !/^https?:\/\/\S+$/.test(u.trim())));
  check("welfare_resources SOURCE_URL 전부 존재", data.resources.length > 0 && !noSource.length && !badUrl.length,
    `${data.resources.length}건` +
      (noSource.length ? `, 출처 없음 ${noSource.map((r) => r.RES_ID)}` : "") +
      (badUrl.length ? `, URL 형식 오류 ${badUrl.map((r) => r.RES_ID)}` : ""));

  // MATCH_GROUPS: GROUP 들을 ";" 로 잇거나, 단독 "ALL"
  const badMatch = data.resources.filter((r) => {
    const gs = r.MATCH_GROUPS.split(";").map((g) => g.trim()).filter(Boolean);
    if (gs.includes("ALL")) return gs.length !== 1;
    return gs.some((g) => !(GROUPS as readonly string[]).includes(g));
  });
  check("MATCH_GROUPS 값이 GROUP 집합 또는 ALL", !badMatch.length, badMatch.map((r) => `${r.RES_ID}:${r.MATCH_GROUPS}`).join(", "));

  const badEmd = data.resources.filter((r) => r.EMD_CD && !data.dongByCode.has(r.EMD_CD));
  check("welfare_resources EMD_CD 유효", !badEmd.length, badEmd.map((r) => r.RES_ID).join(","));

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
