// 대시보드 UI 상태 — 필터는 지도·리스트·패널 공통
import { create } from "zustand";
import { GROUPS, type Group, type RiskLevel } from "@/lib/constants";
import type { Region } from "@/lib/labels";

export type ColorMode = "level" | "group";
export type LeftTab = "map" | "list";

interface UiState {
  region: Region;
  levels: Set<RiskLevel>;
  groups: Set<Group>;
  selectedEmd: string | null;
  colorMode: ColorMode;
  /** 우선순위 N — 지도 "상위 N 강조"와 우선순위 패널이 같이 쓴다 (5~20) */
  topN: number;
  /** 지도에서 상위 N 만 원래 색으로 */
  highlightOn: boolean;
  leftTab: LeftTab;
  /** 지도 이동 요청 (seq 가 바뀔 때마다 flyTo) */
  focus: { emd: string; seq: number } | null;

  setRegion: (r: Region) => void;
  toggleLevel: (l: RiskLevel) => void;
  toggleGroup: (g: Group) => void;
  select: (emd: string | null) => void;
  setColorMode: (m: ColorMode) => void;
  setTopN: (n: number) => void;
  setHighlightOn: (on: boolean) => void;
  setLeftTab: (t: LeftTab) => void;
  /** 지도 탭으로 전환 + 해당 동으로 이동 + 선택 */
  focusOnMap: (emd: string) => void;

  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  /** 대화 입력창에 넣을 초안 (seq 가 바뀔 때마다 입력창에 반영 + 포커스) */
  chatDraft: { text: string; seq: number } | null;
  /** 대화창 펼치고 질문을 입력창에 넣는다 (전송은 사용자가) */
  askInChat: (text: string) => void;

  /** 열려 있는 브리프 모달 */
  brief: BriefRequest | null;
  openBrief: (req: BriefRequest) => void;
  closeBrief: () => void;
}

export type BriefRequest =
  | { kind: "dong"; emd_cd: string }
  | { kind: "quarter"; emd_cds: string[]; region?: string; n: number };

export const TOP_N_MIN = 5;
export const TOP_N_MAX = 20;

const toggled = <T,>(s: Set<T>, v: T) => {
  const next = new Set(s);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};

export const useUi = create<UiState>((set) => ({
  region: "all",
  levels: new Set<RiskLevel>([1, 2, 3, 4, 5]),
  groups: new Set<Group>(GROUPS),
  selectedEmd: null,
  colorMode: "level",
  topN: 10,
  highlightOn: false,
  leftTab: "map",
  focus: null,

  setRegion: (region) => set({ region }),
  toggleLevel: (l) => set((s) => ({ levels: toggled(s.levels, l) })),
  toggleGroup: (g) => set((s) => ({ groups: toggled(s.groups, g) })),
  select: (selectedEmd) => set({ selectedEmd }),
  setColorMode: (colorMode) => set({ colorMode }),
  setTopN: (n) => set({ topN: Math.max(TOP_N_MIN, Math.min(TOP_N_MAX, Math.round(n) || 10)) }),
  setHighlightOn: (highlightOn) => set({ highlightOn }),
  setLeftTab: (leftTab) => set({ leftTab }),
  focusOnMap: (emd) =>
    set((s) => ({ selectedEmd: emd, leftTab: "map", focus: { emd, seq: (s.focus?.seq ?? 0) + 1 } })),

  chatOpen: false,
  setChatOpen: (chatOpen) => set({ chatOpen }),
  chatDraft: null,
  askInChat: (text) => set((s) => ({ chatOpen: true, chatDraft: { text, seq: (s.chatDraft?.seq ?? 0) + 1 } })),

  brief: null,
  openBrief: (brief) => set({ brief }),
  closeBrief: () => set({ brief: null }),
}));
