import { test } from "node:test";
import assert from "node:assert/strict";
import type { DongDTO } from "./api-types";
import { getData, parseFlags } from "./data";
import { tooltipHtml, tooltipText } from "./tooltip";

const dto = (name: string): DongDTO => {
  const k = getData();
  const d = k.dongs.find((x) => x.EMD_NM === name)!;
  const s = k.subtypeByCode.get(d.EMD_CD)!;
  return { ...d, reasons: [null, null], subtype: { SUBTYPE_ID: s.SUBTYPE_ID, SUBTYPE_NM: s.SUBTYPE_NM, FLAGS: parseFlags(s.FLAG), NOTE: s.NOTE } };
};

test("청담동: 3줄 (플래그 + NOTE 40자)", () => {
  const lines = tooltipText(dto("청담동")).split("\n");
  assert.equal(lines[0], "청담동 · 4단계(우선) · HH2");
  assert.equal(lines[1], "드러나지 않는 고립형");
  assert.match(lines[2], /^관찰지구: .{40}…$/);
  assert.match(tooltipHtml(dto("청담동")), /knock-tip-dot/);
});

test("플래그 없으면 2줄, 경계만 있고 NOTE 없으면 이름만", () => {
  assert.equal(tooltipText(dto("서면")).split("\n").length, 2);
  assert.equal(tooltipText(dto("역삼1동")).split("\n")[2], "경계");
});
