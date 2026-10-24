// /about — 이 지도는 어떻게 만들었나 (CLAUDE.md §4.8)
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import ShapStacked from "@/components/ShapStacked";
import { getData } from "@/lib/data";
import { VARIABLE_META } from "@/lib/variables";

export const metadata: Metadata = { title: "이 지도는 어떻게 만들었나 · 노크 KNOCK" };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const th = "border-b border-neutral-300 px-2 py-1.5 text-left font-semibold";
const td = "border-b border-neutral-100 px-2 py-1.5 align-top";

export default function AboutPage() {
  const d = getData();
  const v = d.validation;
  const others = d.sensitivity.filter((s) => !s.방식.startsWith("최종"));
  const corrs = others.map((s) => s["종합점수 순위상관"]);
  const shapRows = d.shap.map((s) => ({ ...s }) as unknown as Record<string, string | number>);

  const metrics: [string, string, string][] = [
    ["실루엣 계수", String(v["실루엣 계수"]), "군집 분리도 (1에 가까울수록 잘 분리, 0.5 이상이 통상 '양호')"],
    ["Davies-Bouldin 지수", String(v["Davies-Bouldin 지수"]), "군집 간 겹침 (낮을수록 좋음)"],
    ["부트스트랩 안정성 ARI (100회)", String(v["부트스트랩 안정성 ARI (100회)"]), "표본을 다시 뽑아 군집했을 때 일치도"],
    ["최소 군집 크기", `${v["최소 군집 크기"]}개 동`, "가장 작은 군집 (HH1)"],
    ["기본 모델과 ARI", String(v["기본 모델(2D 단계점수 K-means K=4)과 ARI"]), "2D 단계점수 K-means K=4 기본 모델과의 일치도"],
    [
      "대리모델 RF 정확도",
      `${v["대리모델 RF 정확도 (반복 5-fold×20)"]} ± ${v["대리모델 RF 정확도 표준편차"]}`,
      "군집을 변수 5개로 다시 맞히는 정확도 (반복 5-fold×20). SHAP 판별 근거의 바탕",
    ],
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader current="/about" />
      <main className="mx-auto max-w-5xl space-y-4 p-4 pb-10">
        <div>
          <h1 className="text-xl font-bold">이 지도는 어떻게 만들었나</h1>
          <p className="mt-1 text-neutral-600">
            강남구 22개·춘천시 25개 행정동, 총 {d.dongs.length}개 동의 중장년(50~60대) 사회적 고립 위험을 공개 집계 데이터로 추정했습니다.
          </p>
        </div>

        <Card title="데이터">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>SKT 유동인구</b> 2025.7~12 — 성·연령·시간대별, 50m 격자를 행정동으로 합산
            </li>
            <li>
              <b>주민등록 인구·세대</b> — 행정동별 성·연령 인구, 세대원 수별 세대
            </li>
            <li>
              <b>행정동 면적</b> — 인구밀도 계산용
            </li>
          </ul>
          <p className="mt-2 text-neutral-600">분석 단위: 행정동 {d.dongs.length}개 (강남구 22 · 춘천시 25). 서비스에는 집계 결과표만 들어 있습니다.</p>
        </Card>

        <Card title="변수 5개">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={th}>변수</th>
                  <th className={th}>축</th>
                  <th className={th}>계산식</th>
                  <th className={th}>위험 방향</th>
                  <th className={th}>쉬운 말</th>
                </tr>
              </thead>
              <tbody>
                {VARIABLE_META.map((m) => (
                  <tr key={m.code}>
                    <td className={`${td} font-medium`}>{m.label}</td>
                    <td className={td}>{m.axis}</td>
                    <td className={td}>{m.formula}</td>
                    <td className={`${td} whitespace-nowrap`}>{m.lowIsRisk ? "낮을수록 위험" : "높을수록 위험"}</td>
                    <td className={td}>{m.plain}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="점수화 → 군집 → 5단계">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              <b>5분위 단계점수</b>: 변수마다 시군구 안에서 5분위로 1~5점 (5 = 위험 방향). 강남과 춘천의 규모 차이가 점수를 지배하지 않게 하기 위함.
            </li>
            <li>
              <b>축 점수</b>: 인구축 = 1인 노출·남성 비율·생활 노출 평균, 지역축 = 생활 리듬·인구밀도 평균 (동일 가중).
            </li>
            <li>
              <b>군집</b>: 시군구 내 z-score로 만든 2D(인구축·지역축) 좌표에 K-means K={v.K}. 군집 이름(HH/HL/LH/LL)은 5분위 축 점수 기준.
            </li>
            <li>
              <b>위험도 5단계</b>: 종합점수(인구축 + 지역축)를 47개 동 전체에서 5분위 — 5단계 = 상위 20%, 먼저 살필 순서.
            </li>
          </ol>
        </Card>

        <Card title="검증">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] tabular-nums">
              <tbody>
                {metrics.map(([k, val, note]) => (
                  <tr key={k}>
                    <td className={`${td} font-medium whitespace-nowrap`}>{k}</td>
                    <td className={`${td} text-right font-semibold whitespace-nowrap`}>{val}</td>
                    <td className={`${td} text-neutral-600`}>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 rounded-lg bg-[#f6f6f3] p-3 leading-relaxed">
            실루엣 {v["실루엣 계수"]}는 통상 기준(0.5)에 못 미치는 &lsquo;보통&rsquo; 수준이다. 입력이 2차원 축 점수라 동들이 겹치는 구조적 한계가 있고, 대신 표본을 바꿔
            다시 군집해도 {Math.round(v["부트스트랩 안정성 ARI (100회)"] * 100)}%가 유지되고(부트스트랩 ARI {v["부트스트랩 안정성 ARI (100회)"]}) 가중치·점수 방식을
            바꿔도 위험 순위 상관이 {Math.min(...corrs).toFixed(2)}~{Math.max(...corrs).toFixed(2)}로 안정적이다.
          </p>

          <h3 className="mt-5 mb-1 font-semibold">민감도 분석 (sensitivity_final.csv)</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] tabular-nums">
              <thead>
                <tr>
                  <th className={th}>방식</th>
                  <th className={`${th} text-right`}>종합점수 순위상관</th>
                  <th className={`${th} text-right`}>군집 일치(ARI)</th>
                  <th className={`${th} text-right`}>상위 10개 동 일치</th>
                </tr>
              </thead>
              <tbody>
                {d.sensitivity.map((s) => (
                  <tr key={s.방식}>
                    <td className={td}>{s.방식}</td>
                    <td className={`${td} text-right`}>{s["종합점수 순위상관"].toFixed(3)}</td>
                    <td className={`${td} text-right`}>{s["군집 일치(ARI)"].toFixed(3)}</td>
                    <td className={`${td} text-right`}>{s["상위 10개 동 일치"]}/10</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-5 mb-1 font-semibold">SHAP 변수 중요도 (shap_importance.csv)</h3>
          <p className="mb-1 text-xs text-neutral-500">대리모델이 각 군집을 판별할 때 변수별 평균 |SHAP| — 막대 길이 = 5개 군집 합계</p>
          <ShapStacked data={shapRows} />
        </Card>

        <Card title="한계">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              <b>정답 부재</b>: 동 단위 &lsquo;실제 고립&rsquo; 지표가 없어 위험도는 예측이 아니라 먼저 살필 순서를 정하는 신호다.
            </li>
            <li>
              <b>업무지구 해석</b>: 삼성1동은 유동인구가 주민의 47배라 생활 노출·생활 리듬이 외부 유동인구 영향을 받는다. 극고위험(HH1) 판정은 과대평가로 보고 탐색지구로 표시했다.
            </li>
            <li>
              <b>소표본</b>: 47개 동, 춘천 외곽 면은 50·60대가 470~1,598명이라 작은 변화에도 점수가 흔들릴 수 있다.
            </li>
            <li>
              <b>통신 데이터 특성</b>: 60세 이상이 한 구간(60GU)으로 묶여 있고, 격자 위치는 거주지가 아니라 머문 곳이며, 6개월 합산이라 계절성을 반영하지 못한다.
            </li>
            <li>
              <b>격자 미사용</b>: 격자에는 유동인구만 있어 인구축(주민등록) 변수를 만들 수 없으므로 행정동 단위로 분석했다.
            </li>
            <li>
              <b>카드 데이터 미반영</b>: 카드 소비는 시군구 단위라 동 변수로 바꾸면 인구 규모와 상관이 과도해 모델에서 뺐다.
            </li>
          </ol>
        </Card>

        <Card title="생성형 AI 사용 명시">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>에이전트 본체</b>: Claude API (tool use) — 결과표를 조회 전용 도구로 읽어 설명하고, 숫자는 결과표 값만 인용한다.
            </li>
            <li>
              <b>개발 보조</b>: Claude Code
            </li>
            <li>
              <b>보고서 초안 보조</b>: Claude
            </li>
          </ul>
          <p className="mt-2 text-neutral-600">
            원본 통신·카드 데이터는 생성형 AI에 입력하지 않았고 서비스에 포함되지 않으며, 대회 후 폐기한다.
          </p>
        </Card>

        <Card title="팀">
          <p>노크 — 고정은 · 이세연 · 이은나</p>
        </Card>
      </main>
    </div>
  );
}
