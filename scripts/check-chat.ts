// 시나리오 A 질문 3개 + 비교·목록 질문 2개를 /api/chat 에 보내 응답과 사후 검사(가드) 결과를 검사한다.
// 실행: (서버 실행 중) npx tsx scripts/check-chat.ts [http://localhost:3000]
import { loadData } from "../src/lib/data";
import { displayName } from "../src/lib/labels";

const BASE = process.argv[2] ?? "http://localhost:3000";
const QUESTIONS = [
  { q: "춘천 외곽 면 중 이번 분기 어디부터 가야 해요?", ctx: { region: "32010", levels: [5], groups: ["HH1", "HH2", "HL", "LH", "LL"] } },
  { q: "서면은 왜 5단계예요?", ctx: { region: "32010", selectedEmd: "32010370" } },
  { q: "이 결과 얼마나 믿을 수 있어요?", ctx: { region: "32010" } },
  { q: "효자2동은 삼성1동보다 안전한가요?", ctx: { region: "all" } },
  { q: "강남 5060 인구 많은 순 상위 5개", ctx: { region: "all" } },
];

const data = loadData();
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function ask(q: string, ctx: object) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: q }], ctx }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const raw = await res.text();
  let text = "";
  let mode = "";
  const tools: string[] = [];
  let guard: { violations: { kind: string; token: string }[]; retried: boolean; removed: boolean } | null = null;
  for (const block of raw.split("\n\n")) {
    const ev = /^event: (.*)$/m.exec(block)?.[1];
    const d = /^data: (.*)$/m.exec(block)?.[1];
    if (!ev || !d) continue;
    const j = JSON.parse(d);
    if (ev === "text") text += j.delta;
    if (ev === "meta") mode = j.mode;
    if (ev === "tool") tools.push(j.label ?? j.name);
    if (ev === "guard") guard = j;
    if (ev === "final") text = j.text;
    if (ev === "error") throw new Error(j.message);
  }
  return { text, mode, tools, guard };
}

async function main() {
for (const { q, ctx } of QUESTIONS) {
  console.log(`\n### ${q}`);
  const { text, mode, tools, guard } = await ask(q, ctx);
  console.log(`  mode=${mode} tools=[${tools.join(" | ")}]`);
  console.log(text.split("\n").map((l) => `  │ ${l}`).join("\n"));
  check("도구 호출 있음", tools.length > 0);
  if (mode === "ai") {
    const g = guard as { violations: { kind: string; token: string }[]; retried: boolean; removed: boolean } | null;
    check(
      "가드 사후 검사 위반 0건",
      !!g && g.violations.length === 0,
      !g ? "guard 이벤트 없음" : g.violations.length ? `${g.violations.map((v) => `${v.kind}:${v.token}`).join(", ")} → ${g.removed ? "문장 제거" : "재요청으로 수정"}` : "",
    );
  } else {
    console.log(`  (가드 검사는 AI 모드에서만 — 현재 ${mode})`);
  }
  check("'근거:' 출처 줄 있음", /^\**근거:/m.test(text));
  const tokens = [...text.matchAll(/([가-힣0-9]*(?:\(춘천\))?)\[\[(\d{8})\]\]/g)]; // 토큰 바로 앞 한글 이름만 (굵게·가운뎃점 제외)
  const bad = tokens.filter(([, name, code]) => {
    const d = data.dongByCode.get(code);
    return !d || (name !== "" && !name.startsWith(d.EMD_NM) && !name.startsWith(displayName(d)));
  });
  check("[[EMD_CD]] 토큰이 결과표 동 이름과 일치", bad.length === 0, `${tokens.length}개` + (bad.length ? `, 불일치 ${bad.map((b) => b[0])}` : ""));
}
console.log(failed ? `\n${failed}개 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
