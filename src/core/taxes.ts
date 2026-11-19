// Impuestos de un inversor particular residente en España (territorio común).
// IRPF de la base del ahorro, vigente desde 2025: 19 % hasta 6.000 €, 21 % hasta 50.000 €,
// 23 % hasta 200.000 €, 27 % hasta 300.000 € y 30 % por encima.
// Simplificaciones: las pérdidas de un año compensan las ganancias de ese año pero no se
// arrastran a años siguientes; no se aplica la regla anti-aplicación (2 meses) ni el límite del
// 25 % entre dividendos y ganancias. Los dividendos ya llegan netos (dividendTaxPct) y no se suman aquí.
import { eur } from "./money";
import type { ClosedTrade } from "./portfolio";

export const SAVINGS_TAX_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 6_000, rate: 0.19 },
  { upTo: 50_000, rate: 0.21 },
  { upTo: 200_000, rate: 0.23 },
  { upTo: 300_000, rate: 0.27 },
  { upTo: Infinity, rate: 0.3 },
];

/** Cuota del IRPF del ahorro para una ganancia neta del año (0 si es pérdida). */
export function savingsTax(netGainEur: number): number {
  if (!(netGainEur > 0)) return 0;
  let tax = 0;
  let from = 0;
  for (const b of SAVINGS_TAX_BRACKETS) {
    const slice = Math.min(netGainEur, b.upTo) - from;
    if (slice <= 0) break;
    tax += slice * b.rate;
    from = b.upTo;
  }
  return eur(tax);
}

/** Ganancia neta realizada (ventas, ya con comisiones) dentro de un año natural (hora UTC). */
export function realizedGainInYear(trades: ClosedTrade[], year: number): number {
  return eur(trades.filter((t) => t.at.getUTCFullYear() === year).reduce((s, t) => s + t.pnlEur, 0));
}
