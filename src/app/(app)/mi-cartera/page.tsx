// Mi cartera real (MyInvestor): solo visible para el propietario (RLS + login).
import { createClient } from "@/lib/supabase/server";
import { Empty, Section, Stat } from "@/components/ui";
import { PortfolioEvolution } from "@/components/PortfolioEvolution";
import { fmtDate, fmtEur, fmtPct, fmtPrice, tone } from "@/lib/format";
import { savingsTax } from "@/core/taxes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#8e7dbe", "#e76f51", "#2a9d8f", "#898781"];

function groupBy(rows: { label: string; value: number }[]) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.label, (m.get(r.label) ?? 0) + r.value);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function Bars({ items, total }: { items: { label: string; value: number; sub?: string }[]; total: number }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const w = total > 0 ? it.value / total : 0;
        return (
          <li key={it.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{it.label}</span>
              <span className="num shrink-0 text-ink-2">
                {fmtPct(w, false, 1)} · {fmtEur(it.value)}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(w * 100, 0.5)}%`, background: PALETTE[i % PALETTE.length] }} />
            </div>
            {it.sub && <p className="mt-0.5 text-xs text-muted">{it.sub}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export default async function MiCarteraPage() {
  const supabase = await createClient();
  const [{ data: posRows }, { data: valRows }, { data: reviewRows }] = await Promise.all([
    supabase.from("pf_positions").select("*").eq("active", true),
    supabase.from("pf_valuations").select("*").order("price_date"),
    supabase.from("pf_reviews").select("*").order("review_date", { ascending: false }).limit(1),
  ]);
  const positions = (posRows ?? []) as Row[];
  const valuations = (valRows ?? []) as Row[];
  if (!positions.length) {
    return <Empty>No hay datos de tu cartera o tu usuario todavía no tiene permiso para verlos.</Empty>;
  }

  // Última valoración de cada posición.
  const last = new Map<string, Row>();
  for (const v of valuations) last.set(v.isin, v);
  const rows = positions
    .map((p): Row & { value: number; invested: number; gain: number; ret: number | null } => {
      const v = last.get(p.isin);
      const value = v ? Number(v.value_eur) : 0;
      const invested = v ? Number(v.invested_eur) : Number(p.invested);
      const priceRet = v ? Number(v.price) / Number(p.avg_cost) - 1 : null; // en la divisa de la posición
      return { ...p, v, value, invested, gain: value - invested, ret: priceRet };
    })
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const invested = rows.reduce((s, r) => s + r.invested, 0);
  const gain = total - invested;
  const lastDate = valuations.reduce((m, v) => (v.price_date > m ? v.price_date : m), "");

  // Evolución: para cada fecha, suma del último valor conocido de cada posición hasta esa fecha.
  const dates = [...new Set(valuations.map((v) => String(v.price_date)))].sort();
  const series = dates.map((d) => {
    let value = 0;
    let inv = 0;
    for (const p of positions) {
      const vs = valuations.filter((v) => v.isin === p.isin && String(v.price_date) <= d);
      const lv = vs.at(-1);
      if (lv) {
        value += Number(lv.value_eur);
        inv += Number(lv.invested_eur);
      }
    }
    return { t: Date.parse(`${d}T12:00:00Z`), value: Math.round(value * 100) / 100, invested: Math.round(inv * 100) / 100 };
  });

  const review = (reviewRows ?? [])[0] as Row | undefined;
  const byPosition = rows.map((r) => ({ label: r.name, value: r.value }));
  const byRegion = groupBy(rows.map((r) => ({ label: r.region, value: r.value })));
  const byTheme = groupBy(rows.map((r) => ({ label: r.theme ?? r.asset_class, value: r.value })));
  const byClass = groupBy(rows.map((r) => ({ label: r.asset_class, value: r.value })));
  const byKind = groupBy(rows.map((r) => ({ label: r.kind === "fondo" ? "Fondos" : r.kind === "etf" ? "ETF" : "Acciones", value: r.value })));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Valor de la cartera" value={fmtEur(total)} sub={`Datos a ${fmtDate(lastDate)}`} />
        <Stat label="Invertido" value={fmtEur(invested)} sub={`${rows.length} posiciones`} />
        <Stat label="Ganancia latente" value={fmtEur(gain)} valueClass={tone(gain)} sub={fmtPct(invested > 0 ? gain / invested : null)} />
        <Stat
          label="IRPF si vendieras todo hoy"
          value={fmtEur(savingsTax(gain))}
          sub="Estimación con la escala del ahorro (19 % hasta 6.000 €). Entre fondos puedes traspasar sin pagar."
        />
      </div>

      <Section title="Resumen del día">
        {review ? (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted">
              Resumen del {fmtDate(review.review_date)} · hoy{" "}
              <span className={tone(review.content?.day_eur)}>
                {fmtEur(review.content?.day_eur)} ({fmtPct(review.content?.day_pct)})
              </span>
            </p>
            <p>{review.content?.day_story ?? review.summary}</p>
            {(review.content?.positions as Row[] | undefined)?.some((x) => x.why) && (
              <ul className="space-y-1.5">
                {(review.content.positions as Row[]).map((x) => (
                  <li key={x.isin}>
                    <span className="font-medium">{x.name}</span>{" "}
                    <span className={`num ${tone(x.day_eur)}`}>
                      {fmtEur(x.day_eur)} ({fmtPct(x.day_pct)})
                    </span>
                    {x.why && <span className="text-ink-2"> · {x.why}</span>}
                    {x.note && <span className="text-xs text-muted"> · {x.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            {(review.content?.news as Row[] | undefined)?.length ? (
              <div>
                <p className="text-xs font-medium text-muted">Noticias que importan</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
                  {(review.content.news as Row[]).map((n) => (
                    <li key={n.title}>
                      <strong className="text-ink">{n.title}</strong> ({n.source}): {n.why_it_matters}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(review.content?.tomorrow as string[] | undefined)?.length ? (
              <div>
                <p className="text-xs font-medium text-muted">Qué se espera para la próxima sesión</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
                  {(review.content.tomorrow as string[]).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <Empty>El primer resumen diario llegará a las 22:20 de un día laborable, cuando esté activado en tu PC.</Empty>
        )}
      </Section>

      <Section title="Evolución: valor frente a lo invertido">
        <PortfolioEvolution data={series} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Dónde está tu dinero (por posición)">
          <Bars items={byPosition} total={total} />
        </Section>
        <div className="space-y-4">
          <Section title="Por región">
            <Bars items={byRegion} total={total} />
          </Section>
          <Section title="Por estilo o temática">
            <Bars items={byTheme} total={total} />
          </Section>
          <Section title="Por tipo de activo">
            <Bars items={[...byClass, ...byKind.map((k) => ({ ...k, label: `Vehículo: ${k.label}` }))]} total={total} />
          </Section>
        </div>
      </div>

      <Section title="Posiciones">
        <div className="overflow-x-auto">
          <table className="data text-sm">
            <thead>
              <tr>
                <th className="text-left">Posición</th>
                <th className="text-right">Peso</th>
                <th className="text-right">Valor</th>
                <th className="text-right">Invertido</th>
                <th className="text-right">Ganancia</th>
                <th className="text-right">Rentab.</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Coste medio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.isin}>
                  <td>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted">
                      {r.isin} · {r.kind === "fondo" ? "Fondo" : r.kind === "etf" ? "ETF" : "Acción"} · {r.region} · {r.theme ?? r.asset_class}
                    </div>
                  </td>
                  <td className="num text-right">{fmtPct(total > 0 ? r.value / total : null, false, 1)}</td>
                  <td className="num text-right">{fmtEur(r.value)}</td>
                  <td className="num text-right">{fmtEur(r.invested)}</td>
                  <td className={`num text-right ${tone(r.gain)}`}>{fmtEur(r.gain)}</td>
                  <td className={`num text-right ${tone(r.ret)}`}>{fmtPct(r.ret)}</td>
                  <td className="num text-right">{r.v ? fmtPrice(Number(r.v.price), r.currency) : "—"}</td>
                  <td className="num text-right">{fmtPrice(Number(r.avg_cost), r.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Valores de MyInvestor; los activos en dólares se pasan a euros con el EUR/USD del día, así que su ganancia en euros es aproximada. La rentabilidad
          de cada posición es la del precio frente al coste medio, en su divisa.
        </p>
      </Section>
    </div>
  );
}
