"use client";
// 즉시 뜨는 작은 설명 상자 (지도 호버 툴팁과 같은 모양: 흰 상자, 12px, 그림자, 최대 폭 280px).
// 브라우저 기본 title(약 1초 지연)을 대신한다. 패널 스크롤 영역에 잘리지 않게 body 로 portal + fixed 배치.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const GAP = 6;
const EDGE = 8;

interface TipProps {
  content: ReactNode;
  children: ReactNode;
  /** SVG 안(차트 축 라벨)에서는 "g" */
  as?: "span" | "g";
  className?: string;
}

export default function Tip({ content, children, as = "span", className }: TipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement & SVGGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setAnchor(r);
  };
  const hide = () => {
    setAnchor(null);
    setPos(null);
  };

  // 상자 크기를 잰 뒤 위치 결정: 기본은 아래, 공간이 없으면 위. 좌우는 화면 안으로
  useLayoutEffect(() => {
    if (!anchor || !tipRef.current) return;
    const { width, height } = tipRef.current.getBoundingClientRect();
    const below = anchor.bottom + GAP;
    const top = below + height > window.innerHeight - EDGE ? anchor.top - GAP - height : below;
    const left = Math.min(Math.max(EDGE, anchor.left), window.innerWidth - width - EDGE);
    setPos({ top, left });
  }, [anchor]);

  const handlers = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    tabIndex: 0,
    "aria-describedby": anchor ? id : undefined,
  };

  const bubble =
    anchor &&
    createPortal(
      <div
        ref={tipRef}
        id={id}
        role="tooltip"
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
        className="pointer-events-none fixed z-[1400] max-w-[280px] rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[12px] leading-[1.45] text-neutral-800 shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
      >
        {content}
      </div>,
      document.body,
    );

  if (as === "g") {
    return (
      <g ref={triggerRef} {...handlers} className={className} style={{ cursor: "help", outline: "none" }}>
        {children}
        {bubble}
      </g>
    );
  }
  return (
    <span ref={triggerRef} {...handlers} className={`cursor-help ${className ?? ""}`}>
      {children}
      {bubble}
    </span>
  );
}
