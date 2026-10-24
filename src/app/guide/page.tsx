// /guide — 군집 유형 가이드 (CLAUDE.md §4.7)
import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import ProfileBars from "@/components/ProfileBars";
import { GROUPS, type Group } from "@/lib/constants";
import { getData, type ClusterProfile } from "@/lib/data";
import { GROUP_COLOR, GROUP_DESC, GROUP_NAME, LEVEL_COLOR, displayName, textOn } from "@/lib/labels";
import { VARIABLE_META } from "@/lib/variables";

export const metadata: Metadata = { title: "군집 가이드 · 노크 KNOCK" };

const f1 = (n: number) => n.toFixed(1);
const DETAILS = ["DETAIL_1", "DETAIL_2", "DETAIL_3", "DETAIL_4", "DETAIL_5"] as const;

function Comparisons({ p }: { p: Record<Group, ClusterProfile> }) {
  const qs = (g: Group) => VARIABLE_META.map((m) => p[g][`${m.code}_Q`]);
  const hh1 = qs("HH1");
  return (
    <section className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">HH1 vs HH2</h2>
        <p className="leading-relaxed">
          HH1은 다섯 변수 모두 {f1(Math.min(...hh1))}~{f1(Math.max(...hh1))}점으로 사람·동네 모두 극단에 있습니다. HH2는 지역축{" "}
          {f1(p.HH2.REG_SCORE)}점·생활 노출 {f1(p.HH2.VISIBLE_IDX_50P_Q)}점으로 동네 요인이 중심이고, 인구축은 {f1(p.HH2.POP_SCORE)}점으로
          HH1({f1(p.HH1.POP_SCORE)}점)보다 낮습니다.
        </p>
      </div>
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">HL vs LH</h2>
        <p className="leading-relaxed">
          HL은 사람 요인(1인 노출 {f1(p.HL.HH1_EXPO_5060_Q)}점·남성 비율 {f1(p.HL.MALE_SHARE_5060_Q)}점)이 높고 동네는 {f1(p.HL.REG_SCORE)}점으로
          붐비는 &lsquo;군중 속 고립&rsquo;입니다. LH는 반대로 사람 {f1(p.LH.POP_SCORE)}점·동네 {f1(p.LH.REG_SCORE)}점으로, 중장년이 활동적이지만
          저밀·시간대 편중 같은 환경을 주의해야 하는 예방형 동입니다.
        </p>
      </div>
    </section>
  );
}

export default function GuidePage() {
  const d = getData();
  const profiles = Object.fromEntries(d.clusterProfiles.map((c) => [c.GROUP, c])) as Record<Group, ClusterProfile>;

  return (
    <div className="min-h-screen">
      <SiteHeader current="/guide" />
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div>
          <h1 className="text-xl font-bold">군집 유형 가이드</h1>
          <p className="mt-1 text-neutral-600">
            47개 동을 인구축(사람)·지역축(동네) 2차원으로 나눈 5개 군집입니다. 이름의 첫 글자는 인구축, 둘째 글자는 지역축의 높고(H) 낮음(L)입니다.
          </p>
        </div>

        {GROUPS.map((g) => {
          const p = profiles[g];
          const members = d.dongs.filter((x) => x.GROUP === g).sort((a, b) => b.RISK_LEVEL - a.RISK_LEVEL || b.POP_5060 - a.POP_5060);
          const rules = d.rules.filter((r) => r.GROUP === g);
          return (
            <section key={g} id={g} className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded-md px-2 py-0.5 text-sm font-bold" style={{ background: GROUP_COLOR[g], color: textOn(GROUP_COLOR[g]) }}>
                  {g}
                </span>
                <h2 className="text-lg font-semibold">{GROUP_NAME[g]}</h2>
                <span className="text-neutral-500 tabular-nums">{p.N_DONG}개 동</span>
                <span className="text-neutral-700">— {GROUP_DESC[g]}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                인구축 {f1(p.POP_SCORE)} · 지역축 {f1(p.REG_SCORE)} (단계점수 평균, 5 = 위험)
              </p>

              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-neutral-500">변수별 단계점수 평균 (1~5)</h3>
                  <ProfileBars color={GROUP_COLOR[g]} data={VARIABLE_META.map((m) => ({ label: m.label, value: p[`${m.code}_Q`] }))} />
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-neutral-500">소속 동 (클릭하면 지도에서 열림)</h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {members.map((x) => (
                      <li key={x.EMD_CD}>
                        <Link
                          href={`/?emd=${x.EMD_CD}`}
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-0.5 hover:bg-neutral-50"
                        >
                          <span
                            className="inline-block min-w-4 rounded px-1 text-center text-[11px] font-semibold tabular-nums"
                            style={{ background: LEVEL_COLOR[x.RISK_LEVEL], color: textOn(LEVEL_COLOR[x.RISK_LEVEL]) }}
                          >
                            {x.RISK_LEVEL}
                          </span>
                          {displayName(x)}
                          <span className="text-[11px] text-neutral-400">{x.SGG_NM}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <h3 className="mt-4 mb-1 text-xs font-semibold text-neutral-500">하위 유형별 대응 (intervention_rules.csv)</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead className="text-xs text-neutral-500">
                    <tr>
                      <th className="py-1 pr-3 font-normal">하위유형</th>
                      <th className="py-1 pr-3 font-normal">대상 동</th>
                      <th className="py-1 pr-3 font-normal">핵심 대응</th>
                      <th className="py-1 font-normal">기존 사업 연계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => {
                      const details = DETAILS.map((k) => r[k]).filter(Boolean);
                      return (
                        <tr key={r.SUBTYPE_ID} className="border-t border-neutral-100 align-top">
                          <td className="py-2 pr-3 font-medium">{r.SUBTYPE_NM}</td>
                          <td className="py-2 pr-3 text-neutral-600">{r.TARGET_DONGS}</td>
                          <td className="py-2 pr-3">
                            <span className="font-semibold">{r.CORE_ACTION || "—"}</span>
                            {details.length > 0 && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-xs text-neutral-500">보완 접근 {details.length}개</summary>
                                <ol className="mt-1 list-decimal space-y-1 pl-5 text-neutral-700">
                                  {details.map((t, i) => (
                                    <li key={i}>{t}</li>
                                  ))}
                                </ol>
                              </details>
                            )}
                          </td>
                          <td className="py-2 text-neutral-700">{r.LINK_PROGRAM || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <Comparisons p={profiles} />
        <p className="pb-6 text-xs text-neutral-400">근거: cluster_profile.csv, dong_cluster.csv, intervention_rules.csv</p>
      </main>
    </div>
  );
}
