"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { day: string; visits: number; interactions: number };

// Colores validados (contraste ≥ 3:1 y separación para daltonismo).
const SERIES = [
  { key: "visits", name: "Visitas", color: "#0077b6" },
  { key: "interactions", name: "Interacciones", color: "#e07400" },
] as const;

function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

export function DailyChart({ data }: { data: Point[] }) {
  const empty = data.every((p) => p.visits === 0 && p.interactions === 0);

  return (
    <div>
      <div className="relative h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#e5e9ee" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={{ stroke: "#cbd5e1" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
              labelFormatter={(label) => shortDay(String(label))}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 12,
                color: "#0f1c24",
              }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={28}
              iconType="plainline"
              wrapperStyle={{ fontSize: 12, color: "#334155" }}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {empty ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-500">
            Aún no hay eventos en los últimos 30 días.
          </p>
        ) : null}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-navy">
          Ver datos en tabla
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Día</th>
                <th className="px-3 py-2 text-right font-medium">Visitas</th>
                <th className="px-3 py-2 text-right font-medium">Interacciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {[...data].reverse().map((p) => (
                <tr key={p.day}>
                  <td className="px-3 py-1.5">{p.day}</td>
                  <td className="px-3 py-1.5 text-right">{p.visits}</td>
                  <td className="px-3 py-1.5 text-right">{p.interactions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
