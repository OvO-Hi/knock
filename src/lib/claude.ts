// Claude API 클라이언트 공용 설정 (서버 전용)
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

/** 자격 증명이 없으면 호출하지 않고 규칙 기반 폴백으로 간다 */
export const hasCredentials = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}
