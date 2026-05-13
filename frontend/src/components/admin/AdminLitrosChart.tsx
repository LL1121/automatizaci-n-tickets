"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type LitrosBarRow = { patente: string; litros: number };

type Props = { data: LitrosBarRow[] };

export function AdminLitrosChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-zinc-500">Sin datos en este período.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="patente" tick={{ fill: "#a1a1aa", fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
        <YAxis tick={{ fill: "#71717a", fontSize: 11 }} width={44} />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
          labelStyle={{ color: "#fafafa" }}
          formatter={(v: number) => [`${v} L`, "Litros"]}
        />
        <Bar dataKey="litros" fill="#22d3ee" radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
