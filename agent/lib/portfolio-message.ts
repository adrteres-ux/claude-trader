// Mensaje de Telegram del resumen diario: corto y visual (decisión del usuario, 2026-11-19).
// Una línea por posición con el nombre del fondo y círculo verde/rojo; sin servicios externos: los datos no salen de Telegram.
import { escapeHtml } from "./telegram";

export interface MsgPosition {
  label: string; // nombre del fondo como en MyInvestor (lo importante, ~25 caracteres)
  dayEur: number;
  dayPct: number | null;
  valueEur: number;
  stale: boolean; // sin valor liquidativo nuevo hoy
}

export interface MsgInput {
  dateLabel: string; // "viernes, 20 de noviembre"
  total: number;
  dayEur: number;
  dayPct: number;
  invested: number;
  positions: MsgPosition[];
  headline?: string | null; // una frase: por qué
  movers?: { label: string; why: string }[]; // 2-3 posiciones que más se han movido
  news?: { title: string; source: string; why?: string | null }[];
  tomorrowLabel?: string;
  tomorrow?: string[];
  chartSent?: boolean; // el gráfico en verde/rojo va como imagen aparte: no repetir las líneas por posición
}

const eur0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
const eur2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
const FLAT_EUR = 0.5; // por debajo de 50 céntimos se considera "sin cambio"
export const fmtSignedEur = (v: number, decimals = 2) => {
  const shown = (decimals ? eur2 : eur0).format(Math.abs(v));
  const zero = Number(shown.replace(/\./g, "").replace(",", ".")) === 0;
  return `${zero ? "" : v > 0 ? "+" : "−"}${shown} €`;
};
export const fmtSignedPct = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const dot = (v: number) => (v >= FLAT_EUR ? "🟢" : v <= -FLAT_EUR ? "🔴" : "⚪");

/** Una línea por posición con el nombre del fondo: 🟢 sube, 🔴 baja, ⚪ sin cambio o sin valor nuevo.
 *  Telegram no permite colorear texto, así que el color va en el círculo y en la barra. */
export function positionLine(p: MsgPosition, maxAbs: number, width = 5): string {
  const name = `<b>${escapeHtml(p.label)}</b>`;
  if (p.stale) return `⚪ ${name} · <i>sin valor nuevo</i>`;
  const moved = Math.abs(p.dayEur) >= FLAT_EUR;
  if (!moved) return `⚪ ${name} · 0 €`;
  const n = maxAbs > 0 ? Math.max(1, Math.round((Math.abs(p.dayEur) / maxAbs) * width)) : 1;
  const bar = (p.dayEur > 0 ? "🟩" : "🟥").repeat(n);
  return `${dot(p.dayEur)} ${name} ${bar} <b>${fmtSignedEur(p.dayEur)}</b> (${fmtSignedPct(p.dayPct)})`;
}

export function buildPortfolioMessage(m: MsgInput): string {
  const L: string[] = [];
  const gain = m.total - m.invested;
  L.push(`<b>📊 Mi cartera</b> · ${escapeHtml(m.dateLabel)}`);
  L.push("");
  L.push(`${dot(m.dayEur)} <b>${fmtSignedEur(m.dayEur)}</b> hoy (${fmtSignedPct(m.dayPct)})`);
  L.push(`💼 ${eur0.format(m.total)} € · 📈 ${fmtSignedEur(gain, 0)} (${fmtSignedPct(m.invested > 0 ? gain / m.invested : null)}) desde que invertiste`);
  if (m.headline) {
    L.push("");
    L.push(`💡 ${escapeHtml(m.headline)}`);
  }
  // Gráfico: ordenado de más ganancia a más pérdida; las posiciones sin VL nuevo al final.
  const live = m.positions.filter((p) => !p.stale).sort((a, b) => b.dayEur - a.dayEur);
  const stale = m.positions.filter((p) => p.stale);
  const maxAbs = Math.max(0, ...live.map((p) => Math.abs(p.dayEur)));
  if (!m.chartSent) {
    L.push("");
    for (const p of [...live, ...stale]) L.push(positionLine(p, maxAbs));
  }
  if (m.movers?.length) {
    L.push("");
    for (const x of m.movers) L.push(`▸ <b>${escapeHtml(x.label)}</b>: ${escapeHtml(x.why)}`);
  }
  if (m.news?.length) {
    L.push("");
    L.push("📰 <b>Noticias</b>");
    for (const n of m.news) {
      L.push(`• <b>${escapeHtml(n.title)}</b> <i>(${escapeHtml(n.source)})</i>`);
      if (n.why) L.push(`  ${escapeHtml(n.why)}`);
    }
  }
  if (m.tomorrow?.length) {
    L.push("");
    L.push(`🗓 <b>Mañana${m.tomorrowLabel ? ` (${escapeHtml(m.tomorrowLabel)})` : ""}</b>`);
    for (const t of m.tomorrow) L.push(`• ${escapeHtml(t)}`);
  }
  L.push("");
  L.push(`<i>Fondos: último valor liquidativo publicado (suele ser el del día anterior).${stale.length ? " «Sin valor nuevo» = el fondo aún no ha publicado su valor de hoy." : ""}</i>`);
  return L.join("\n");
}
