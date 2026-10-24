"use client";
// 동 상세 패널 (CLAUDE.md §4.3). 권장 조치·연결 자원·브리프는 3·5단계에서 추가.
import { useSyncExternalStore } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DongDTO } from "@/lib/api-types";
import type { ClusterProfile, InterventionRule, LevelPolicy } from "@/lib/data";
import type { ResourceMatch } from "@/lib/match";
import type { RiskLevel } from "@/lib/constants";
import {
  FLAG_COLOR,
  GROUP_COLOR,
  GROUP_DESC,
  GROUP_NAME,
  LEVEL_COLOR,
  PRIORITY_LABEL,
  displayName,
  fmtInt,
  textOn,
} from "@/lib/labels";
import { VARIABLE_META, type VariableMeta } from "@/lib/variables";
import { useUi } from "@/store/ui";
import { RecommendedActions, ResourceList } from "./DongActions";

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      {title && <h3 className="mb-2 font-semibold">{title}</h3>}
      {children}
    </section>
  );
}

function Badge({ bg, children, title }: { bg: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: bg, color: textOn(bg) }}>
      {children}
    </span>
  );
}

interface BarDatum {
  meta: VariableMeta;
  score: number;
  raw: string;
}

const ROW_H = 46;

function YTick({ x, y, payload, data, small }: { x?: number | string; y?: number | string; payload?: { index: number }; data: BarDatum[]; small?: boolean }) {
  const d = payload ? data[payload.index] : undefined;
  if (!d || x === undefined || y === undefined) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} y={d.meta.lowIsRisk ? -2 : 4} textAnchor="end" fontSize={small ? 11 : 13} fill="#222">
        {d.meta.label}
      </text>
      {d.meta.lowIsRisk && (
        <text x={-8} y={12} textAnchor="end" fontSize={small ? 9.5 : 10.5} fill="#888">
          값이 낮을수록 위험
        </text>
      )}
    </g>
  );
}

function VarTooltip({ active, payload }: { active?: boolean; payload?: { payload: BarDatum }[] }) {
  if (!active || !payload?.length) return null;
  const { meta, score, raw } = payload[0].payload;
  return (
    <div className="max-w-72 rounded-lg border border-neutral-200 bg-white p-3 text-xs shadow-md">
      <div className="mb-1 font-semibold">
        {meta.label} <span className="font-normal text-neutral-500">({meta.axis})</span>
      </div>
      <div className="tabular-nums">
        단계점수 {score}점 · 원값 {raw}
      </div>
      <div className="mt-1 text-neutral-600">계산식: {meta.formula}</div>
      <div className="mt-1">{meta.plain}</div>
      <div className="mt-1 text-neutral-500">{meta.lowIsRisk ? "값이 낮을수록 위험" : "값이 높을수록 위험"} · 단계점수 5 = 시군구 안 가장 위험</div>
    </div>
  );
}

// 좁은 화면(<480px)에서는 라벨 폭·오른쪽 여백을 줄여 막대 영역을 확보
const NARROW = "(max-width: 479px)";
function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(NARROW);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

function VariableBars({ dong }: { dong: DongDTO }) {
  const narrow = useNarrow();
  const data: BarDatum[] = VARIABLE_META.map((meta) => ({
    meta,
    score: dong[`${meta.code}_Q`],
    raw: meta.format(dong[meta.code]),
  }));
  return (
    <div style={{ height: data.length * ROW_H + 28 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: narrow ? 92 : 110, bottom: 4, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} fontSize={11} tickLine={false} />
          <YAxis
            type="category"
            dataKey={(d: BarDatum) => d.meta.label}
            width={narrow ? 124 : 150}
            tickLine={false}
            axisLine={false}
            tick={(p) => <YTick x={p.x} y={p.y} payload={p.payload} data={data} small={narrow} />}
          />
          <Tooltip content={<VarTooltip />} cursor={{ fill: "#f3f3f0" }} />
          <Bar dataKey="score" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.meta.code} fill={LEVEL_COLOR[d.score as RiskLevel]} />
            ))}
            <LabelList
              dataKey="raw"
              position="right"
              content={(p) => {
                const { x = 0, y = 0, width = 0, height = 0, index = 0 } = p as {
                  x?: number; y?: number; width?: number; height?: number; index?: number;
                };
                const d = data[index];
                return (
                  <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(height) / 2 + 4} fontSize={12} fill="#333">
                    <tspan fontWeight={600}>{d.score}점</tspan>
                    <tspan fill="#777" dx={6}>{d.raw}</tspan>
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Reasons({ dong }: { dong: DongDTO }) {
  return (
    <ul className="space-y-2">
      {dong.reasons.map((r, i) => {
        const rawText = i === 0 ? dong.REASON_1 : dong.REASON_2;
        if (!r) return <li key={i} className="text-neutral-500">{rawText}</li>;
        const safe = r.side === "안전";
        return (
          <li key={i} className={safe ? "text-neutral-500" : ""}>
            <span className="font-medium">{r.label}</span> — {r.side} 쪽 신호{" "}
            <span className="tabular-nums">(SHAP {r.shap >= 0 ? "+" : ""}{r.shap.toFixed(2)})</span>
            {safe && <div className="text-xs">이 변수는 오히려 안전 쪽</div>}
          </li>
        );
      })}
    </ul>
  );
}

function ClusterCompare({ dong, profile }: { dong: DongDTO; profile?: ClusterProfile }) {
  if (!profile) return <p className="text-neutral-500">군집 프로파일 없음</p>;
  return (
    <table className="w-full text-left tabular-nums">
      <thead className="text-xs text-neutral-500">
        <tr>
          <th className="py-1 font-normal">변수 (단계점수)</th>
          <th className="py-1 text-right font-normal">이 동</th>
          <th className="py-1 text-right font-normal">{dong.GROUP} 평균 ({profile.N_DONG}동)</th>
        </tr>
      </thead>
      <tbody>
        {VARIABLE_META.map((m) => {
          const mine = dong[`${m.code}_Q`];
          const avg = profile[`${m.code}_Q`];
          return (
            <tr key={m.code} className="border-t border-neutral-100">
              <td className="py-1">{m.label}</td>
              <td className="py-1 text-right font-semibold">{mine.toFixed(1)}점</td>
              <td className="py-1 text-right text-neutral-600">{avg.toFixed(1)}점</td>
            </tr>
          );
        })}
        <tr className="border-t border-neutral-200">
          <td className="py-1">인구축 / 지역축</td>
          <td className="py-1 text-right font-semibold">
            {dong.POP_SCORE.toFixed(1)} / {dong.REG_SCORE.toFixed(1)}
          </td>
          <td className="py-1 text-right text-neutral-600">
            {profile.POP_SCORE.toFixed(1)} / {profile.REG_SCORE.toFixed(1)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function flagTitle(flag: string, dong: DongDTO): string {
  const note = dong.subtype?.NOTE;
  if (flag === "경계") {
    const base = `대리모델이 이 군집이라고 본 확률(P_OWN) ${dong.P_OWN.toFixed(2)} — 0.5 미만이라 인접 군집과 경계에 있는 동`;
    return note ? `${note}\n${base}` : base;
  }
  return note || flag;
}

export default function DongPanel({
  dong,
  profile,
  inFilter,
  rule,
  policy,
  resources,
}: {
  dong: DongDTO;
  profile?: ClusterProfile;
  inFilter: boolean;
  rule?: InterventionRule;
  policy?: LevelPolicy;
  /** lib/match.ts matchResources() 결과 */
  resources: ResourceMatch;
}) {
  const focusOnMap = useUi((s) => s.focusOnMap);
  const askInChat = useUi((s) => s.askInChat);
  const openBrief = useUi((s) => s.openBrief);
  const levelColor = LEVEL_COLOR[dong.RISK_LEVEL];

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold">
            {displayName(dong)} <span className="font-normal text-neutral-500">· {dong.SGG_NM}</span>
          </h2>
          <button
            onClick={() => focusOnMap(dong.EMD_CD)}
            className="shrink-0 rounded-lg border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50"
          >
            지도에서 보기
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge bg={levelColor}>
            위험도 {dong.RISK_LEVEL}단계 ({PRIORITY_LABEL[dong.RISK_LEVEL]})
          </Badge>
          <Badge bg={GROUP_COLOR[dong.GROUP]}>
            {dong.GROUP} {GROUP_NAME[dong.GROUP]}
          </Badge>
          {dong.subtype && (
            <span className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700">
              {dong.subtype.SUBTYPE_NM}
            </span>
          )}
          {dong.subtype?.FLAGS.map((f) => (
            <Badge key={f} bg={FLAG_COLOR[f]} title={flagTitle(f, dong)}>
              {f === "경계" ? `경계 동(군집 확률 ${dong.P_OWN.toFixed(2)})` : f}
            </Badge>
          ))}
        </div>
        <p className="mt-1.5 text-neutral-600">{GROUP_DESC[dong.GROUP]}</p>
        {dong.subtype?.NOTE && <p className="mt-1 text-xs text-neutral-500">해석 주의: {dong.subtype.NOTE}</p>}
        {!inFilter && <p className="mt-1 text-xs text-amber-700">현재 필터 밖의 동입니다.</p>}

        <div className="mt-3 space-y-0.5 tabular-nums">
          <div>
            <span className="font-semibold">종합 {dong.TOTAL_SCORE.toFixed(1)}</span> = 인구축 {dong.POP_SCORE.toFixed(1)} + 지역축{" "}
            {dong.REG_SCORE.toFixed(1)}
          </div>
          <div className="text-neutral-600">
            50·60대 {fmtInt(dong.POP_5060)}명 / 총 {fmtInt(dong.TOT_POP_CNT)}명 / {dong.AREA_KM2.toLocaleString("ko-KR")}km²
          </div>
          {policy && (
            <div>
              <span className="text-neutral-500">운영 주기:</span> {policy.PRIORITY_LABEL} · {policy.CYCLE} · {policy.ACTION_MODE}
            </div>
          )}
        </div>
      </Card>

      <Card title="변수별 단계점수 (1~5, 5 = 시군구 안 가장 위험)">
        <VariableBars dong={dong} />
      </Card>

      <Card title="왜 이 군집인가 (SHAP 판별 근거)">
        <Reasons dong={dong} />
      </Card>

      <Card title="같은 군집 평균과 비교">
        <ClusterCompare dong={dong} profile={profile} />
      </Card>

      <Card title="권장 조치">
        <RecommendedActions key={dong.EMD_CD} rule={rule} />
      </Card>

      <Card title={`연결 가능한 자원 (${resources.own.length + resources.general.length}건)`}>
        <ResourceList key={dong.EMD_CD} match={resources} emdCd={dong.EMD_CD} />
      </Card>

      <div className="flex gap-2">
        <button
          onClick={() => openBrief({ kind: "dong", emd_cd: dong.EMD_CD })}
          className="flex-1 rounded-lg border border-neutral-900 bg-white px-3 py-2 hover:bg-neutral-50"
        >
          브리프 만들기
        </button>
        <button
          onClick={() => askInChat(`${displayName(dong)}은 왜 ${dong.RISK_LEVEL}단계인가요?`)}
          className="flex-1 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-white hover:bg-neutral-700"
        >
          대화에서 묻기
        </button>
      </div>

      <p className="px-1 text-xs text-neutral-400">
        근거: dong_cluster.csv, cluster_profile.csv, dong_subtype.csv, level_policy.csv
        {rule ? `, intervention_rules.csv(${rule.SUBTYPE_ID})` : ""}, welfare_resources.csv
      </p>
    </div>
  );
}
