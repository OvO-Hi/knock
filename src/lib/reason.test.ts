import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData } from "./data";
import { parseReason } from "./reason";

test("예시 문자열 파싱", () => {
  assert.deepEqual(parseReason("2-1 생활 리듬 (위험 쪽, +0.24)"), {
    label: "2-1 생활 리듬",
    side: "위험",
    shap: 0.24,
  });
  assert.equal(parseReason("2-1 생활 리듬")?.side, undefined);
});

test("dong_cluster.csv 47행 × REASON 2개 전부 파싱", () => {
  const { dongs } = loadData();
  assert.equal(dongs.length, 47);
  const failed = dongs.flatMap((d) =>
    [d.REASON_1, d.REASON_2].filter((r) => parseReason(r) === null).map((r) => `${d.EMD_NM}: ${r}`),
  );
  assert.deepEqual(failed, []);
});
