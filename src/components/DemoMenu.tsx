"use client";
// 헤더 "데모 ▼": 시나리오 A~C (data/scenarios.json) 선택 시 화면 상태 세팅 + 대화창 펼침 + 질문 칩 교체
import scenarioFile from "../../data/scenarios.json";
import { useUi, type Scenario } from "@/store/ui";

const SCENARIOS = (scenarioFile as { scenarios: Scenario[] }).scenarios;

export default function DemoMenu() {
  const { demo, applyScenario, exitDemo } = useUi();
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className={`hidden sm:inline ${demo ? "font-semibold text-sky-800" : "text-neutral-500"}`}>데모</span>
      <select
        aria-label="데모 시나리오"
        value={demo?.id ?? ""}
        title={demo?.persona}
        onChange={(e) => {
          const s = SCENARIOS.find((x) => x.id === e.target.value);
          if (s) applyScenario(s);
          else exitDemo();
        }}
        className={`max-w-[9.5rem] rounded-md border px-1.5 py-1 ${demo ? "border-sky-400 bg-sky-50" : "border-neutral-300 bg-white"}`}
      >
        <option value="">데모 ▼</option>
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
    </label>
  );
}
