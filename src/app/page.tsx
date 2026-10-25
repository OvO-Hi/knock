import Dashboard from "@/components/Dashboard";

// /?emd=EMD_CD: 가이드 등에서 특정 동을 선택한 채로 열기
export default async function Home({ searchParams }: { searchParams: Promise<{ emd?: string | string[] }> }) {
  const { emd } = await searchParams;
  const code = typeof emd === "string" && /^\d{8}$/.test(emd) ? emd : undefined;
  return <Dashboard initialEmd={code} />;
}
