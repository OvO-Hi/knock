// 데모 시나리오(data/scenarios.json) 질문 전부를 /api/chat 에 보내 응답을 data/demo_cache.json 에 저장.
// 실행: (서버 실행 중, DEMO_CACHE 끈 상태) npx tsx scripts/warm-demo.ts [http://localhost:3000]
// 시나리오마다 질문을 순서대로 이어서 묻는다(앞 답변이 다음 질문의 대화 맥락).
import fs from "node:fs";
import path from "node:path";
import type { DemoCacheEntry, DemoCacheFile } from "../src/lib/demoCache";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ROOT = path.join(__dirname, "..");

interface Scenario {
  id: string;
  title: string;
  state: { region: string; levels: number[]; groups: string[]; selectedEmd: string | null };
  questions: string[];
}

async function ask(messages: { role: string; content: string }[], ctx: object) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ctx }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  let text = "";
  let mode = "";
  let guard: { violations: unknown[]; removed: boolean } | null = null;
  const tools: string[] = [];
  for (const block of (await res.text()).split("\n\n")) {
    const ev = /^event: (.*)$/m.exec(block)?.[1];
    const d = /^data: (.*)$/m.exec(block)?.[1];
    if (!ev || !d) continue;
    const j = JSON.parse(d);
    if (ev === "meta") mode = j.mode;
    else if (ev === "tool") tools.push(j.label ?? j.name);
    else if (ev === "text") text += j.delta;
    else if (ev === "final") text = j.text;
    else if (ev === "guard") guard = j;
    else if (ev === "error") throw new Error(j.message);
  }
  return { text, mode, tools, guard };
}

async function main() {
  const { scenarios } = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "scenarios.json"), "utf8")) as { scenarios: Scenario[] };
  const entries: DemoCacheEntry[] = [];
  let model = "";
  for (const s of scenarios) {
    const history: { role: string; content: string }[] = [];
    for (const q of s.questions) {
      history.push({ role: "user", content: q });
      const r = await ask(history, s.state);
      if (r.mode !== "ai") throw new Error(`AI 모드가 아님(${r.mode}) — API 키·DEMO_CACHE=0 확인: ${q}`);
      history.push({ role: "assistant", content: r.text });
      entries.push({ scenario: s.id, question: q, text: r.text, tools: r.tools });
      const g = r.guard;
      console.log(`${s.id} · ${q}\n  도구 ${r.tools.length}개 · 가드 위반 ${g?.violations.length ?? "?"}${g?.removed ? " (문장 제거)" : ""} · ${r.text.length}자`);
    }
  }
  model = process.env.ANTHROPIC_MODEL ?? "(서버 설정)";
  const out: DemoCacheFile = { generated_at: new Date().toISOString(), model, entries };
  fs.writeFileSync(path.join(ROOT, "data", "demo_cache.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`\n저장: data/demo_cache.json (${entries.length}개)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
