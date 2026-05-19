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

const BRAND = "#0066CC";

export function AdminLitrosChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-field-muted">Sin datos en este período.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
        <XAxis dataKey="patente" tick={{ fill: "#495057", fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
        <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} width={44} />
        <Tooltip
          contentStyle={{ background: "#FFFFFF", border: "1px solid #DEE2E6", borderRadius: 8, color: "#333" }}
          labelStyle={{ color: "#0066CC", fontWeight: 600 }}
          formatter={(v: number) => [`${v} L`, "Litros"]}
        />
        <Bar dataKey="litros" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
