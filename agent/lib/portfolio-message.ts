// Mensaje de Telegram del resumen diario: corto y visual (decisión del usuario, 2026-11-19).
// Gráfico de barras en texto monoespaciado (<pre>), sin servicios externos: los datos no salen de Telegram.
import { escapeHtml } from "./telegram";

export interface MsgPosition {
  label: string; // nombre corto (máx. ~12 caracteres)
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

const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
const padL = (s: string, n: number) => s.padStart(n);

/** Una línea del gráfico: etiqueta, barra proporcional al mayor movimiento del día e importe. */
export function barLine(p: MsgPosition, maxAbs: number, width = 8): string {
  const label = pad(p.label, 12);
  if (p.stale) return `${label}  ${"·".repeat(width)} ${padL("sin VL", 7)}`;
  const moved = Math.abs(p.dayEur) >= FLAT_EUR;
  const n = maxAbs > 0 ? Math.round((Math.abs(p.dayEur) / maxAbs) * width) : 0;
  const filled = moved ? Math.max(1, n) : 0;
  const bar = "▰".repeat(filled) + "▱".repeat(width - filled);
  const arrow = !moved ? "=" : p.dayEur > 0 ? "▲" : "▼";
  return `${label} ${arrow}${bar} ${padL(moved ? fmtSignedEur(p.dayEur, 0) : "0 €", 7)}`;
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
  L.push("");
  L.push(`<pre>${[...live, ...stale].map((p) => escapeHtml(barLine(p, maxAbs))).join("\n")}</pre>`);
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
  if (stale.length) {
    L.push("");
    L.push("<i>sin VL = el fondo aún no ha publicado su valor de hoy</i>");
  }
  return L.join("\n");
}
