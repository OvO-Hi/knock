// 세 페이지(대시보드·/guide·/about) 공통 헤더. 로고와 페이지 이동만 두고 필터는 툴바로 분리
import Link from "next/link";

const NAV = [
  { href: "/guide", label: "군집 가이드" },
  { href: "/about", label: "만든 방법" },
] as const;

export default function SiteHeader({ current, right }: { current: "/" | "/guide" | "/about"; right?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4">
      <Link href="/" className="flex min-w-0 items-baseline gap-2" aria-label="노크, 지도로 가기">
        <span className="shrink-0 text-lg font-extrabold tracking-tight whitespace-nowrap">노크</span>
        <span className="hidden min-w-0 truncate text-xs text-neutral-500 min-[480px]:inline">
          중장년 고립 위험 지도<span className="hidden sm:inline"> · 강남구·춘천시 2025.7~12</span>
        </span>
      </Link>
      <nav className="ml-auto flex shrink-0 items-center gap-1 text-[13px]">
        {current !== "/" && (
          <Link href="/" className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100">
            지도
          </Link>
        )}
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={current === n.href ? "page" : undefined}
            className={`rounded-md px-2 py-1 ${current === n.href ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
          >
            {n.label}
          </Link>
        ))}
        {right}
      </nav>
    </header>
  );
}
