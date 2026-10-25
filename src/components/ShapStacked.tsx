"use client";
// SHAP 변수 중요도: 군집별 누적 막대 (/about)
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GROUPS } from "@/lib/constants";
import { GROUP_COLOR } from "@/lib/labels";

export default function ShapStacked({ data }: { data: Record<string, string | number>[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="#eee" />
          <XAxis type="number" fontSize={11} tickLine={false} />
          <YAxis type="category" dataKey="변수명" width={100} fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v) => Number(v).toFixed(3)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {GROUPS.map((g) => (
            <Bar key={g} dataKey={g} stackId="shap" fill={GROUP_COLOR[g]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
