// 데모 답변 캐시 (data/demo_cache.json). DEMO_CACHE=1 일 때 /api/chat 이 같은 질문에 캐시 답변을 스트리밍한다.
import fs from "node:fs";
import path from "node:path";

export interface DemoCacheEntry {
  scenario: string;
  question: string;
  text: string;
  tools: string[];
}

export interface DemoCacheFile {
  generated_at: string;
  model: string;
  entries: DemoCacheEntry[];
}

export const DEMO_CACHE_PATH = path.join(process.cwd(), "data", "demo_cache.json");

/** 질문 정규화: 공백·문장부호·기호 제거 */
export const normalizeQuestion = (q: string) => q.replace(/[\s\p{P}\p{S}]/gu, "");

let cache: Map<string, DemoCacheEntry> | null = null;

export function lookupDemoCache(question: string): DemoCacheEntry | undefined {
  if (process.env.DEMO_CACHE !== "1") return undefined;
  if (!cache) {
    cache = new Map();
    try {
      const raw = JSON.parse(fs.readFileSync(DEMO_CACHE_PATH, "utf8")) as DemoCacheFile;
      for (const e of raw.entries) cache.set(normalizeQuestion(e.question), e);
    } catch (e) {
      console.warn("[demo-cache] demo_cache.json 을 읽지 못했습니다", e);
    }
  }
  return cache.get(normalizeQuestion(question));
}
