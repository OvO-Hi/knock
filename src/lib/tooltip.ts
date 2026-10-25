// 동 툴팁 (지도 호버·리스트·우선 동 표 공통): 1줄 이름·단계·군집 / 2줄 하위유형 / 3줄 플래그·NOTE
import type { DongDTO } from "./api-types";
import { FLAG_COLOR, PRIORITY_LABEL, displayName } from "./labels";

const NOTE_MAX = 40;
const cut = (s: string) => (s.length > NOTE_MAX ? `${s.slice(0, NOTE_MAX)}…` : s);

export interface TooltipParts {
  head: string;
  subtype: string | null;
  flags: { name: string; color: string }[];
  /** 플래그 줄 문구: "관찰지구: NOTE 앞 40자…" 또는 플래그 이름만. 플래그 없으면 null */
  flagLine: string | null;
}

export function tooltipParts(d: DongDTO): TooltipParts {
  const flags = (d.subtype?.FLAGS ?? []).map((f) => ({ name: f, color: FLAG_COLOR[f] }));
  const names = flags.map((f) => f.name).join("·");
  const note = d.subtype?.NOTE?.trim();
  return {
    head: `${displayName(d)} · ${d.RISK_LEVEL}단계(${PRIORITY_LABEL[d.RISK_LEVEL]}) · ${d.GROUP}`,
    subtype: d.subtype?.SUBTYPE_NM ?? null,
    flags,
    flagLine: flags.length ? (note ? `${names}: ${cut(note)}` : names) : null,
  };
}

/** 리스트·표의 title 속성용 (줄바꿈 텍스트) */
export function tooltipText(d: DongDTO): string {
  const t = tooltipParts(d);
  return [t.head, t.subtype, t.flagLine].filter(Boolean).join("\n");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Leaflet 툴팁 HTML (플래그 줄 앞에 배지 색 점) */
export function tooltipHtml(d: DongDTO): string {
  const t = tooltipParts(d);
  const dots = t.flags.map((f) => `<span class="knock-tip-dot" style="background:${f.color}"></span>`).join("");
  return [
    `<div class="knock-tip-head">${esc(t.head)}</div>`,
    t.subtype ? `<div class="knock-tip-sub">${esc(t.subtype)}</div>` : "",
    t.flagLine ? `<div class="knock-tip-flag">${dots}${esc(t.flagLine)}</div>` : "",
  ].join("");
}
