import { test } from "node:test";
import assert from "node:assert/strict";
import { REMOVED_NOTE, collectFacts, findViolations, removeViolations } from "./guard";
import { runTool } from "./tools";

const facts = () => collectFacts([runTool("get_dong", { emd_cd: "서면" }), runTool("get_validation", {})]);

test("도구 결과 값·47개 동·소형 정수는 통과", () => {
  const t = "서면[[32010370]]은 5단계이고 50·60대 1,598명, 남성 비율 0.557, 실루엣 0.435입니다. 47개 동 중 4위.\n근거: dong_cluster.csv(POP_5060)";
  assert.deepEqual(findViolations(t, facts()), []);
});

test("% 환산·없는 숫자·없는 지명을 잡는다", () => {
  const t = "남성이 55.7%입니다. 순위 상관은 92~96%이고 약 2,345명입니다. 청평면과 가평읍은 주의 동입니다. 활동과 이동은 괜찮다. 정렬하면 이렇고 미만이면 보통, 쓰면 된다.";
  const v = findViolations(t, facts());
  const kinds = (k: string) => v.filter((x) => x.kind === k).map((x) => x.token);
  assert.ok(kinds("percent").includes("55.7%"));
  assert.ok(kinds("number").includes("2,345"));
  assert.deepEqual(kinds("place").sort(), ["가평읍", "청평면"]);
});

test("위반 문장 제거 + 안내 한 줄, 근거 줄 유지", () => {
  const t = "서면은 5단계입니다. 청평면도 위험합니다.\n\n근거: dong_cluster.csv";
  const out = removeViolations(t, findViolations(t, facts()));
  assert.ok(!out.includes("청평면"));
  assert.ok(out.includes("서면은 5단계입니다."));
  assert.ok(out.includes(REMOVED_NOTE));
  assert.ok(out.trim().endsWith("근거: dong_cluster.csv"));
});
