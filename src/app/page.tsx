import { GROUPS, getData } from "@/lib/data";

// 0단계 임시 페이지: 데이터 로드 확인용
export default function Home() {
  const { dongs } = getData();
  const byGroup = GROUPS.map((g) => ({ g, n: dongs.filter((d) => d.GROUP === g).length }));

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">노크 — 데이터 로드 OK: {dongs.length}동</h1>
      <ul className="mt-4 space-y-1">
        {byGroup.map(({ g, n }) => (
          <li key={g}>
            <span className="inline-block w-12 font-mono">{g}</span> {n}동
          </li>
        ))}
      </ul>
    </main>
  );
}
