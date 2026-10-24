import { test } from "node:test";
import assert from "node:assert/strict";
import { getData } from "./data";
import { TOOL_DEFS, TOOL_NAMES, ToolError, resolveDong, runTool } from "./tools";

type Row = Record<string, unknown>;

test("도구 10종 · 스키마 이름 일치", () => {
  assert.equal(TOOL_NAMES.length, 10);
  assert.deepEqual(TOOL_DEFS.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
});

test("이름 매칭: 서면 / 춘천 서면 / 서면(춘천) / 코드", () => {
  for (const q of ["서면", "춘천 서면", "서면(춘천)", " 서 면 ", "32010370"]) {
    assert.equal(resolveDong(q).EMD_CD, "32010370", q);
  }
});

test("이름 매칭: '강남동'은 춘천 강남동, '강남구'는 지역이라 오류", () => {
  assert.equal(resolveDong("강남동").SGG_CD, "32010");
  assert.equal(resolveDong("강남동(춘천)").EMD_CD, "32010680");
  assert.equal(resolveDong("강남 역삼1동").EMD_CD, "11230640");
  assert.throws(() => resolveDong("강남구"), ToolError);
  assert.throws(() => resolveDong("강남동", "강남구"), ToolError);
  assert.throws(() => resolveDong("없는동"), ToolError);
});

test("get_dong 서면: 결과표 값 그대로 + 출처", () => {
  const r = runTool("get_dong", { emd_cd: "서면" });
  const d = r.data as Row;
  const raw = getData().dongByCode.get("32010370")!;
  assert.equal(d.EMD_CD, "32010370");
  assert.equal(d.RISK_LEVEL, raw.RISK_LEVEL);
  assert.equal(d.POP_5060, raw.POP_5060);
  assert.equal(d.GROUP, "HH1");
  assert.equal(d.SUBTYPE_ID, "HH1_RURAL");
  assert.ok(r.sources.some((s) => s.startsWith("dong_cluster.csv")));
});

test("prioritize 춘천 5: 단계↓ → POP_5060↓ 정렬과 일치", () => {
  const expected = getData()
    .dongs.filter((d) => d.SGG_CD === "32010")
    .sort((a, b) => b.RISK_LEVEL - a.RISK_LEVEL || b.POP_5060 - a.POP_5060)
    .slice(0, 5)
    .map((d) => d.EMD_NM);
  const r = runTool("prioritize", { region: "춘천시", n: 5 });
  const got = ((r.data as Row).우선_동 as Row[]).map((x) => x.이름);
  assert.deepEqual(got, expected);
  assert.ok(((r.data as Row).우선_동 as Row[]).every((x) => typeof x.선정_이유 === "string"));
});

test("prioritize exclude_flags: 탐색지구 제외 시 삼성1동 빠짐", () => {
  const names = (n: Row) => ((n.우선_동 as Row[]) ?? []).map((x) => x.이름);
  const all = runTool("prioritize", { region: "강남구", n: 22 }).data as Row;
  const ex = runTool("prioritize", { region: "강남구", n: 22, constraints: { exclude_flags: ["탐색지구"] } }).data as Row;
  assert.ok(names(all).includes("삼성1동"));
  assert.ok(!names(ex).includes("삼성1동"));
});

test("list_dongs 읍면 필터 + pop5060 정렬", () => {
  const r = runTool("list_dongs", { region: "춘천시", admin_type: "읍면", sort: "pop5060" }).data as Row;
  const rows = r.동 as Row[];
  assert.ok(rows.length > 0 && rows.every((x) => /[읍면]$/.test(String(x.이름))));
  const pops = rows.map((x) => Number(x.POP_5060));
  assert.deepEqual(pops, [...pops].sort((a, b) => b - a));
});

test("explain_dong: 변수 5개, 순위 형식 n/m", () => {
  const r = runTool("explain_dong", { emd_cd: "역삼1동" }).data as Row;
  const vs = r.변수 as Row[];
  assert.equal(vs.length, 5);
  assert.ok(vs.every((v) => /^\d+\/22$/.test(String(v.시군구_내_위험순위))));
  assert.ok(vs.some((v) => v.SHAP_판별근거 !== null));
});

test("get_resources: ALL 사업은 LL 동에도 연결", () => {
  const r = runTool("get_resources", { emd_cd: "퇴계동" }).data as Row;
  assert.ok((r.연결_가능 as Row[]).some((x) => x.MATCH_GROUPS === "ALL"));
});

test("get_validation · recommend_actions · generate_brief", () => {
  const v = runTool("get_validation", {}).data as Row;
  assert.equal((v.검증_요약 as Row)["실루엣 계수"], 0.435);
  const a = runTool("recommend_actions", { emd_cd: "대치2동" }).data as Row;
  assert.equal((a.대응_규칙 as Row).SUBTYPE_ID, "HH2_FAMILY");
  const b = runTool("generate_brief", { emd_cd: "서면" }).data as Row;
  assert.match(String(b.markdown), /^# 서면\(춘천시\)/);
  assert.throws(() => runTool("nope", {}), ToolError);
});
