// 대화 답변 사후 검사 (CLAUDE.md §5.2 가드레일 1). 이번 턴의 도구 결과에 없는 숫자·지명·% 환산을 찾는다.
import { getData } from "./data";
import { displayName } from "./labels";

export interface Facts {
  /** 정규화된 숫자 (쉼표 제거, 소수 변형 포함) */
  numbers: Set<string>;
  /** 쓸 수 있는 지명 (47개 동 + 도구 결과 문자열에 나온 ○○동/면/읍) */
  places: Set<string>;
  /** 도구 결과 문자열에 그대로 있던 "n%" 표기 */
  percents: Set<string>;
}

export interface Violation {
  kind: "place" | "number" | "percent";
  token: string;
}

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;
// ○○동/면/읍 + (조사 또는 경계). 조사가 붙어도 지명 부분만 잡는다
const PLACE_RE = /[가-힣]{1,5}\d?(?:동|면|읍)(?=(?:은|는|이|가|을|를|의|에서|에게|에|과|와|도|만|으로|로|보다|까지|부터|처럼|이나|이고|이며|이라|입니다|인|[^가-힣]|$))/g;
const PCT_RE = /\d[\d,]*(?:\.\d+)?\s*%/g;

// ○○동/면/읍 으로 끝나지만 지명이 아닌 흔한 낱말
const NOT_PLACE = new Set(
  (
    "활동 이동 행동 공동 운동 변동 연동 노동 자동 출동 작동 가동 충동 감동 협동 소동 진동 발동 아동 동동 유동 기동 파동 난동 선동 " +
    "측면 반면 방면 전면 이면 화면 대면 비대면 직면 표면 국면 단면 지면 장면 일면 다면 양면 외면 당면 정면 내면 수면 하면 " +
    "면면 체면 안면 도읍 읍면 읍면동 행정동 동동 각동 해당동 이웃동 같은동 인근동 다른동 전체동 우선동 경계동 관찰동"
  ).split(" "),
);

// "~하면/~이면/~쓰면" 같은 연결어미: '면' 앞 음절이 이 중 하나면 지명 후보에서 뺀다
const VERB_BEFORE_MYEON = new Set(
  "하 이 으 되 보 쓰 오 가 나 지 리 르 우 다 려 러 라 니 않 없 있 같 크 작 많 적 높 낮 렇 떻 거 기 추 주 두 바 받 알 모 세 해 봐 써 와 줘 겠 았 었 였 했 됐 된 는 던 시 키 치 피 히 비 미 뀌 꾸 뜨 트 프 브 드 그 스 즈 츠 느 므 브 면 읽 찾 묻 듣 걷 살 늘 줄 볼 할 갈 올 될 질 길".split(" "),
);
const isVerbMyeon = (tok: string) => tok.endsWith("면") && tok.length >= 2 && VERB_BEFORE_MYEON.has(tok[tok.length - 2]);

const norm = (s: string) => s.replace(/,/g, "");

function addNumber(set: Set<string>, raw: string | number) {
  const s = norm(String(raw));
  const n = Number(s);
  set.add(s);
  if (!Number.isFinite(n)) return;
  set.add(String(n));
  // 표시용 반올림 변형 (패널·표와 같은 자리수)
  for (const d of [0, 1, 2, 3]) set.add(n.toFixed(d));
  set.add(String(Math.abs(n)));
}

function walk(v: unknown, f: Facts) {
  if (typeof v === "number") addNumber(f.numbers, v);
  else if (typeof v === "string") {
    for (const m of norm(v).match(NUM_RE) ?? []) addNumber(f.numbers, m);
    for (const m of v.match(PLACE_RE) ?? []) f.places.add(m);
    for (const m of v.match(PCT_RE) ?? []) f.percents.add(norm(m).replace(/\s/g, ""));
  } else if (Array.isArray(v)) v.forEach((x) => walk(x, f));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(x, f));
}

/** 이번 턴 도구 결과(+ 시스템 프롬프트에 준 변수 설명서)에서 쓸 수 있는 사실 모음 */
export function collectFacts(toolResults: unknown[], extraText = ""): Facts {
  const f: Facts = { numbers: new Set(), places: new Set(), percents: new Set() };
  for (const d of getData().dongs) {
    f.places.add(d.EMD_NM);
    f.places.add(displayName(d));
  }
  toolResults.forEach((r) => walk(r, f));
  if (extraText) walk(extraText, f);
  return f;
}

/** 허용하는 숫자: 100 이하 정수(단계·순위·동 수·개수), 연도, 도구 결과에 있는 값 */
function numberAllowed(tok: string, f: Facts): boolean {
  const s = norm(tok);
  const n = Number(s);
  if (/^\d+$/.test(s) && n <= 100) return true;
  if (/^20[2-3]\d$/.test(s)) return true;
  return f.numbers.has(s) || f.numbers.has(String(n));
}

export function findViolations(text: string, f: Facts): Violation[] {
  // [[EMD_CD]] 토큰, 근거 줄(파일·컬럼명)은 검사하지 않는다
  const body = text
    .replace(/\[\[\d{8}\]\]/g, "")
    .split("\n")
    .filter((l) => !/^\s*\**근거:/.test(l))
    .join("\n");
  const out: Violation[] = [];
  const seen = new Set<string>();
  const push = (v: Violation) => {
    const k = `${v.kind}:${v.token}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  };

  for (const m of body.match(PCT_RE) ?? []) {
    if (!f.percents.has(norm(m).replace(/\s/g, ""))) push({ kind: "percent", token: m.trim() });
  }
  // 변수 라벨("1-1", "2-2")과 범위 기호 사이 숫자도 개별 검사
  for (const m of body.replace(/\b[12]-[123]\b/g, " ").match(NUM_RE) ?? []) {
    if (!numberAllowed(m, f)) push({ kind: "number", token: m });
  }
  for (const m of body.match(PLACE_RE) ?? []) {
    const bare = m.replace(/\(.*$/, "");
    if (!f.places.has(m) && !f.places.has(bare) && !NOT_PLACE.has(m) && !isVerbMyeon(m)) push({ kind: "place", token: m });
  }
  return out;
}

export const formatViolations = (vs: Violation[]) =>
  vs.map((v) => `- ${v.kind === "place" ? "결과표에 없는 지명" : v.kind === "percent" ? "% 환산·도구 결과에 없는 비율" : "도구 결과에 없는 숫자"}: ${v.token}`).join("\n");

export const REMOVED_NOTE = "(일부 문장이 결과표 검증을 통과하지 못해 제외되었습니다)";

/** 위반 토큰이 든 문장(표는 행)을 지운다. 근거 줄은 남긴다 */
export function removeViolations(text: string, vs: Violation[]): string {
  if (!vs.length) return text;
  const bad = (s: string) => vs.some((v) => s.includes(v.token));
  const lines = text.split("\n").flatMap((line) => {
    if (/^\s*\**근거:/.test(line) || !bad(line)) return [line];
    if (/^\s*\|/.test(line)) return []; // 표 행 통째로
    const kept = line.split(/(?<=[.!?。])\s+/).filter((s) => !bad(s));
    return kept.length ? [kept.join(" ")] : [];
  });
  const cleaned = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const src = cleaned.match(/\n\s*\**근거:.*$/);
  return src
    ? `${cleaned.slice(0, src.index).trim()}\n\n${REMOVED_NOTE}${src[0]}`
    : `${cleaned}\n\n${REMOVED_NOTE}`;
}

/**
 * 줄표(em dash U+2014, en dash U+2013) 치환: 숫자 사이 en dash는 물결(~), 나머지는 가운뎃점(·).
 * 답변·브리프 문장 표기 규칙 (CLAUDE.md §5.2).
 */
export function replaceDashes(text: string): string {
  return text
    .replace(/(\d)\s*\u2013\s*(\d)/g, "$1~$2")
    .replace(/\s*[\u2014\u2013]+\s*/g, " · ")
    .replace(/^ · /gm, "· ");
}

export const hasDashes = (text: string) => /[\u2014\u2013]/.test(text);
