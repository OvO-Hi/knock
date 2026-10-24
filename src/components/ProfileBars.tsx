"use client";
// 군집 단계점수 평균 5개 가로 막대 (/guide)
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";

export default function ProfileBars({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  return (
    <div style={{ height: data.length * 30 + 24 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }} barCategoryGap={6}>
          <XAxis type="number" domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} fontSize={11} tickLine={false} />
          <YAxis type="category" dataKey="label" width={130} fontSize={12} tickLine={false} axisLine={false} />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" fontSize={12} formatter={(v) => Number(v).toFixed(1)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
