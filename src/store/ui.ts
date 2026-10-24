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
  highlightTopN: number | null;
  leftTab: LeftTab;
  /** 지도 이동 요청 (seq 가 바뀔 때마다 flyTo) */
  focus: { emd: string; seq: number } | null;

  setRegion: (r: Region) => void;
  toggleLevel: (l: RiskLevel) => void;
  toggleGroup: (g: Group) => void;
  select: (emd: string | null) => void;
  setColorMode: (m: ColorMode) => void;
  setHighlightTopN: (n: number | null) => void;
  setLeftTab: (t: LeftTab) => void;
  /** 지도 탭으로 전환 + 해당 동으로 이동 + 선택 */
  focusOnMap: (emd: string) => void;

  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  /** 대화 입력창에 넣을 초안 (seq 가 바뀔 때마다 입력창에 반영 + 포커스) */
  chatDraft: { text: string; seq: number } | null;
  /** 대화창 펼치고 질문을 입력창에 넣는다 (전송은 사용자가) */
  askInChat: (text: string) => void;
}

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
  highlightTopN: null,
  leftTab: "map",
  focus: null,

  setRegion: (region) => set({ region }),
  toggleLevel: (l) => set((s) => ({ levels: toggled(s.levels, l) })),
  toggleGroup: (g) => set((s) => ({ groups: toggled(s.groups, g) })),
  select: (selectedEmd) => set({ selectedEmd }),
  setColorMode: (colorMode) => set({ colorMode }),
  setHighlightTopN: (highlightTopN) => set({ highlightTopN }),
  setLeftTab: (leftTab) => set({ leftTab }),
  focusOnMap: (emd) =>
    set((s) => ({ selectedEmd: emd, leftTab: "map", focus: { emd, seq: (s.focus?.seq ?? 0) + 1 } })),

  chatOpen: false,
  setChatOpen: (chatOpen) => set({ chatOpen }),
  chatDraft: null,
  askInChat: (text) => set((s) => ({ chatOpen: true, chatDraft: { text, seq: (s.chatDraft?.seq ?? 0) + 1 } })),
}));
