// 전역 토스트 (API 오류 등)
import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  kind: "error" | "info";
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: Toast["kind"]) => void;
  dismiss: (id: number) => void;
}

let seq = 1;

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, kind = "error") => {
    // 같은 문구가 이미 떠 있으면 중복으로 쌓지 않는다
    if (get().toasts.some((t) => t.message === message)) return;
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => get().dismiss(id), 6000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** 컴포넌트 밖(fetch 콜백 등)에서 호출 */
export const toastError = (message: string) => useToast.getState().push(message, "error");
