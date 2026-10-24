// 시나리오 A 질문 3개를 /api/chat 에 보내 응답을 검사한다.
// 실행: (서버 실행 중) npx tsx scripts/check-chat.ts [http://localhost:3000]
import { loadData } from "../src/lib/data";
import { displayName } from "../src/lib/labels";

const BASE = process.argv[2] ?? "http://localhost:3000";
const QUESTIONS = [
  { q: "춘천 외곽 면 중 이번 분기 어디부터 가야 해요?", ctx: { region: "32010", levels: [5], groups: ["HH1", "HH2", "HL", "LH", "LL"] } },
  { q: "서면은 왜 5단계예요?", ctx: { region: "32010", selectedEmd: "32010370" } },
  { q: "이 결과 얼마나 믿을 수 있어요?", ctx: { region: "32010" } },
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
  for (const block of raw.split("\n\n")) {
    const ev = /^event: (.*)$/m.exec(block)?.[1];
    const d = /^data: (.*)$/m.exec(block)?.[1];
    if (!ev || !d) continue;
    const j = JSON.parse(d);
    if (ev === "text") text += j.delta;
    if (ev === "meta") mode = j.mode;
    if (ev === "tool") tools.push(j.label ?? j.name);
    if (ev === "error") throw new Error(j.message);
  }
  return { text, mode, tools };
}

async function main() {
for (const { q, ctx } of QUESTIONS) {
  console.log(`\n### ${q}`);
  const { text, mode, tools } = await ask(q, ctx);
  console.log(`  mode=${mode} tools=[${tools.join(" | ")}]`);
  console.log(text.split("\n").map((l) => `  │ ${l}`).join("\n"));
  check("도구 호출 있음", tools.length > 0);
  check("'근거:' 출처 줄 있음", /^\**근거:/m.test(text));
  const tokens = [...text.matchAll(/([^\s|()[\]]*?)\[\[(\d{8})\]\]/g)];
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
