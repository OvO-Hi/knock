"use client";
import { useToast } from "@/store/toast";

export default function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed top-3 right-3 z-[3500] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] shadow-lg ${
            t.kind === "error" ? "bg-red-700 text-white" : "bg-neutral-900 text-white"
          }`}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} aria-label="알림 닫기" className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
