// 세 페이지(대시보드·/guide·/about) 공통 헤더
import Link from "next/link";

const NAV = [
  { href: "/", label: "지도" },
  { href: "/guide", label: "군집 가이드" },
  { href: "/about", label: "이 지도는 어떻게 만들었나" },
] as const;

export default function SiteHeader({ current, children }: { current: "/" | "/guide" | "/about"; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-neutral-200 bg-white px-4 py-2.5">
      <Link href="/" className="text-base font-bold whitespace-nowrap">
        노크 KNOCK <span className="font-normal text-neutral-500">· 중장년 고립 위험 지도</span>
      </Link>
      <nav className="flex gap-1 text-[13px]">
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
      </nav>
      {children}
    </header>
  );
}
