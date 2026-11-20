// Gráfico del día de Mi cartera (petición del usuario, 2026-11-20): una barra por posición, VERDE si sube y
// ROJA si baja, con el nombre del fondo y lo ganado/perdido. Se dibuja en SVG y se pasa a PNG en el propio PC
// con `sharp` (ya viene con Next.js): ningún servicio externo, los datos solo van a tu chat de Telegram.
import { fmtSignedEur, fmtSignedPct, type MsgPosition } from "./portfolio-message";

const GREEN = "#16a34a";
const RED = "#dc2626";
const GREY = "#9ca3af";
const FLAT_EUR = 0.5;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface ChartInput {
  title: string; // "Viernes, 20 de noviembre"
  dayEur: number;
  dayPct: number;
  total: number;
  positions: MsgPosition[];
}

export function portfolioChartSvg(c: ChartInput): string {
  const W = 1000;
  const top = 140;
  const rowH = 92;
  const live = c.positions.filter((p) => !p.stale).sort((a, b) => b.dayEur - a.dayEur);
  const stale = c.positions.filter((p) => p.stale);
  const rows = [...live, ...stale];
  const H = top + rows.length * rowH + 50;
  const x0 = 40;
  const barMax = W - 2 * x0; // la barra más larga ocupa todo el ancho
  const maxAbs = Math.max(1, ...live.map((p) => Math.abs(p.dayEur)));
  const dayColor = c.dayEur >= FLAT_EUR ? GREEN : c.dayEur <= -FLAT_EUR ? RED : GREY;
  const total = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" }).format(c.total);

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, Helvetica, sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  out.push(`<text x="${x0}" y="58" font-size="32" font-weight="700" fill="#111827">Mi cartera · ${esc(c.title)}</text>`);
  out.push(`<text x="${x0}" y="104" font-size="30" font-weight="700" fill="${dayColor}">${esc(fmtSignedEur(c.dayEur))} hoy (${esc(fmtSignedPct(c.dayPct))})</text>`);
  out.push(`<text x="${W - x0}" y="104" font-size="26" fill="#4b5563" text-anchor="end">Total ${esc(total)} €</text>`);

  // Cada posición: nombre e importe arriba; debajo, una barra verde (sube) o roja (baja) proporcional.
  rows.forEach((p, i) => {
    const y = top + i * rowH;
    const name = p.label.length > 34 ? `${p.label.slice(0, 33)}…` : p.label;
    out.push(`<text x="${x0}" y="${y + 30}" font-size="25" font-weight="600" fill="#111827">${esc(name)}</text>`);
    out.push(`<rect x="${x0}" y="${y + 44}" width="${barMax}" height="28" rx="8" fill="#f3f4f6"/>`);
    if (p.stale) {
      out.push(`<text x="${W - x0}" y="${y + 30}" font-size="22" fill="${GREY}" font-style="italic" text-anchor="end">sin valor nuevo</text>`);
      return;
    }
    const moved = Math.abs(p.dayEur) >= FLAT_EUR;
    const color = !moved ? GREY : p.dayEur > 0 ? GREEN : RED;
    const len = moved ? Math.max(14, (Math.abs(p.dayEur) / maxAbs) * barMax) : 0;
    if (len) out.push(`<rect x="${x0}" y="${y + 44}" width="${len}" height="28" rx="8" fill="${color}"/>`);
    const label = `${moved ? fmtSignedEur(p.dayEur) : "0 €"}   ${fmtSignedPct(p.dayPct)}`;
    out.push(`<text x="${W - x0}" y="${y + 30}" font-size="25" font-weight="700" fill="${color}" text-anchor="end">${esc(label)}</text>`);
  });
  out.push(`<text x="40" y="${H - 18}" font-size="18" fill="${GREY}">Ganado o perdido hoy por posición · fondos: último valor liquidativo publicado</text>`);
  out.push(`</svg>`);
  return out.join("\n");
}

/** PNG del gráfico; null si `sharp` no está disponible (entonces el mensaje lleva las líneas de texto). */
export async function portfolioChartPng(c: ChartInput): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(Buffer.from(portfolioChartSvg(c)), { density: 144 }).png().toBuffer();
  } catch {
    return null;
  }
}
