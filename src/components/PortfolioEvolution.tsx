"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const dateFmt = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "short" });
const longFmt = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium" });
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function PortfolioEvolution({ data }: { data: { t: number; value: number; invested: number }[] }) {
  if (data.length < 2) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        El gráfico aparecerá cuando haya al menos dos días de valoraciones. Se añadirá una cada día laborable a las 22:20.
      </p>
    );
  }
  return (
    <div className="h-72 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => dateFmt.format(new Date(t))}
            stroke="var(--axis)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) => eur.format(v)}
            stroke="var(--axis)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={80}
            domain={["auto", "auto"]}
          />
          <Tooltip
            labelFormatter={(t) => longFmt.format(new Date(Number(t)))}
            formatter={(v, name) => [eur2.format(Number(v)), name]}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--ink)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} iconType="plainline" />
          <Line type="monotone" dataKey="value" name="Valor" stroke="var(--s-portfolio)" strokeWidth={2} dot={false} />
          <Line type="stepAfter" dataKey="invested" name="Invertido" stroke="var(--s-cash)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
