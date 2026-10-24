// Claude API 클라이언트 공용 설정 (서버 전용)
import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/beta/messages/messages";

type ModelParams = Pick<MessageCreateParamsBase, "max_tokens"> &
  Partial<Pick<MessageCreateParamsBase, "output_config" | "betas" | "fallbacks">>;

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

/** 자격 증명이 없으면 호출하지 않고 규칙 기반 폴백으로 간다 */
export const hasCredentials = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// 5세대 모델(effort·adaptive thinking·서버측 거절 폴백 지원) 여부. 구형 모델은 이 파라미터를 보내면 400.
const GEN5 = /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5-1|fable-5|sonnet-5|haiku-5-5)$/;
// 서버측 거절 폴백 "default" 형식을 받는 모델 (Claude API 기준)
const FALLBACK_DEFAULT = /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5-1)$/;

/**
 * 모델별 요청 파라미터. 5세대는 thinking 이 기본으로 켜져 max_tokens 에 포함되므로 여유를 둔다.
 * - effort: 도구 루프는 medium, 짧은 문장 작성은 low
 * - fallbacks "default": 안전 분류기가 거절하면 서버가 다른 모델로 이어서 답한다
 */
export function requestParams(kind: "agent" | "write"): ModelParams {
  if (!GEN5.test(MODEL)) {
    return { max_tokens: kind === "agent" ? 1500 : 600 };
  }
  return {
    max_tokens: kind === "agent" ? 8000 : 3000,
    output_config: { effort: kind === "agent" ? "medium" : "low" },
    ...(FALLBACK_DEFAULT.test(MODEL) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}
