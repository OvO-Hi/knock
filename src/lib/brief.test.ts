import { test } from "node:test";
import assert from "node:assert/strict";
import { MEMO_SLOT, SUMMARY_SLOT, buildDongBrief, buildQuarterBrief, fillBrief, numbersGrounded } from "./brief";

test("동 브리프: 섹션·슬롯·수치가 결과표 값", () => {
  const b = buildDongBrief("서면");
  for (const h of ["## 핵심 수치", "## 왜 위험한가", "## 권장 조치", "## 연결 자원", "## 다음 점검 시점", "## 근거 표"]) {
    assert.ok(b.template.includes(h), h);
  }
  assert.ok(b.template.includes(SUMMARY_SLOT) && b.template.includes(MEMO_SLOT));
  assert.ok(b.template.includes("1,598명"));
  assert.match(b.template, /종합점수 47개 동 중 \d+위 · 우선순위\(단계→5060 인구\) 전체 \d+위, 춘천시 \d+위/);
  assert.ok(b.template.includes("이번 분기"));
  const filled = fillBrief(b, b.ruleSummary, b.ruleMemo);
  assert.ok(!filled.includes("{{"));
  assert.ok(numbersGrounded(b.ruleSummary + b.ruleMemo, b.template));
});

test("분기 브리프: 지역 요약·우선 동 표", () => {
  const b = buildQuarterBrief({ region: "춘천시", n: 5 });
  assert.ok(b.template.includes("- 동 수: 25개"));
  const rows = b.template.split("\n").filter((l) => /^\| \d+ \|/.test(l));
  assert.equal(rows.length, 5);
  assert.ok(rows[0].includes("서면"));
  assert.ok(numbersGrounded(b.ruleSummary + b.ruleMemo, b.template));
});

test("numbersGrounded: 템플릿에 없는 숫자는 거부", () => {
  const t = "50·60대 1,598명, 종합 10.0";
  assert.ok(numbersGrounded("1598명이고 종합 10점, 5단계", t));
  assert.ok(!numbersGrounded("약 2,000명", t));
});
