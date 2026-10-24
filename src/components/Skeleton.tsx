// 데이터 로딩 중 자리 표시
const bar = "animate-pulse rounded-md bg-neutral-200/80";

export function MapSkeleton() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#eef0ec]" aria-busy="true" aria-label="지도 불러오는 중">
      <div className="flex flex-col items-center gap-2 text-[13px] text-neutral-500">
        <div className={`${bar} h-24 w-40`} />
        결과표·경계 불러오는 중…
      </div>
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="패널 불러오는 중">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
          <div className={`${bar} h-3 w-24`} />
          <div className={`${bar} h-5 w-2/3`} />
          <div className={`${bar} h-3 w-full`} />
          <div className={`${bar} h-3 w-5/6`} />
        </div>
      ))}
    </div>
  );
}
