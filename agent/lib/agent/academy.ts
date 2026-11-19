// Academia: cada día, tras el cierre, analiza por qué la cartera ganó o perdió (atribución por
// posición frente al MSCI World), saca lecciones y actualiza el MANUAL DE ESTRATEGIA que leen el
// gestor y la gestora de riesgos en la siguiente ejecución. Ciclo de mejora continua (decisión del
// usuario, 2026-11-19): antes era semanal.
import { z } from "zod";
import { BENCHMARKS } from "@/core/benchmarks";
import { zonedTimeToUtc } from "@/core/calendar";
import { readAll, type Db, type Experiment } from "../db";
import { latestPlaybook, saveReport, callAgent } from "./team";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const text = (max: number) => z.string().trim().min(1).max(max);

export const AcademySchema = z
  .object({
    summary: text(500).describe("Balance del día en 2-3 frases"),
    why: text(1500).describe("Por qué la cartera ganó o perdió hoy frente al MSCI World: qué posiciones y qué decisiones lo explican, con cifras"),
    grade: z.enum(["A", "B", "C", "D", "E"]).describe("Nota del día para el proceso de decisión (no solo el resultado)"),
    lessons: z
      .array(z.object({ title: text(100), evidence: text(500), lesson: text(500) }).strict())
      .min(1)
      .max(5),
    playbook: text(3000).describe("Manual de estrategia COMPLETO y actualizado: reglas concretas que seguirá el equipo desde la próxima sesión"),
    changes: z.array(text(300)).max(6).describe("Qué cambia respecto al manual anterior y por qué (vacío si no cambia nada)"),
    experiments: z.array(text(300)).max(4).describe("Hipótesis a probar en las próximas sesiones"),
  })
  .strict();
export type AcademyReport = z.infer<typeof AcademySchema>;

const SYSTEM = `Eres la ACADEMIA de un fondo de inversión simulado (dinero ficticio) gestionado por un equipo de IAs: gestor de cartera, analista cuantitativo y gestora de riesgos. Cada día, tras el cierre, haces el post-mortem y mejoras la estrategia del equipo para la sesión siguiente: el objetivo es una mejora continua, aprendiendo de cada acierto y de cada error.
Reglas:
1. Usa SOLO los datos del mensaje.
2. Explica en "why" POR QUÉ la cartera ganó o perdió hoy frente al MSCI World: usa la ATRIBUCIÓN POR POSICIÓN (qué activos sumaron o restaron y cuánto), las operaciones del día y el efectivo (el efectivo no se mueve: en un día alcista resta y en uno bajista suma). Separa lo que fue el mercado en general de lo que fueron decisiones propias.
3. Distingue suerte de habilidad. Un solo día es casi todo ruido: no conviertas el movimiento de un día en una regla. Una lección merece cambiar el manual solo si la apoyan varios días, un error de proceso claro (se ignoró una tesis, un límite, un coste o el calendario) o una pauta que se repite en las LECCIONES ANTERIORES. Lo que solo es una sospecha va a "experiments", no al manual.
4. Evalúa el PROCESO (¿se siguieron las tesis, los límites, el manual?, ¿se operó de más o de menos?, ¿se respetaron costes e impuestos?, ¿se cumplió el mandato de diversificación global?) y el RESULTADO frente a los benchmarks.
5. Escribe lecciones concretas con evidencia (cifras del mensaje), que el gestor pueda aplicar en la próxima sesión.
6. Devuelve el MANUAL DE ESTRATEGIA completo (no solo los cambios): reglas claras y operativas sobre selección, tamaño de posiciones, horizontes (estratégico y táctico), cuándo salir, uso del efectivo, riesgo, calendario (resultados y bancos centrales) y costes. Mantén lo que funciona; cambia solo lo que los datos desaconsejan, y explícalo en "changes". Máximo 3000 caracteres.
7. El manual no puede contradecir las reglas duras del sistema (máx. 25 % por activo, solo contado, unidades enteras, solo EUR/USD, importe mínimo por operación) ni el mandato del propietario (buscar acciones de todo el mundo, no solo índices de EE. UU. y Europa). Decisión del propietario: NO hay límite al número de operaciones por día ni por semana: no pongas topes de operaciones en el manual; controla los costes con tamaños mínimos y exigiendo una razón para cada operación.
8. Escribe en español y responde solo con el JSON del esquema.`;

/** Semana ISO (p. ej. 2026-W43) de una fecha YYYY-MM-DD. */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const pc = (x: number) => `${(x * 100).toFixed(2)} %`;
const short = (s: unknown, n: number) => {
  const t = String(s ?? "");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Atribución del día: cuánto aportó cada posición entre dos valoraciones (en EUR, aproximada). */
export function dailyAttribution(before: Row, last: Row): { symbol: string; eur: number; note: string }[] {
  const prev = new Map(((before.holdings ?? []) as Row[]).map((h) => [String(h.symbol), h]));
  const now = new Map(((last.holdings ?? []) as Row[]).map((h) => [String(h.symbol), h]));
  const out: { symbol: string; eur: number; note: string }[] = [];
  for (const [symbol, h0] of prev) {
    const h1 = now.get(symbol);
    const p0 = Number(h0.priceLocal) / (Number(h0.fxRate) || 1);
    if (!h1) {
      out.push({ symbol, eur: NaN, note: "vendida hoy (ver operaciones)" });
      continue;
    }
    const p1 = Number(h1.priceLocal) / (Number(h1.fxRate) || 1);
    const q = Number(h0.quantity);
    out.push({ symbol, eur: q * (p1 - p0), note: `${q} uds, ${pc(p1 / p0 - 1)} en EUR${Number(h1.quantity) !== q ? ` (cantidad cambió a ${h1.quantity})` : ""}` });
  }
  for (const [symbol, h1] of now) {
    if (prev.has(symbol)) continue;
    out.push({ symbol, eur: Number(h1.valueEur) - Number(h1.costEur), note: "comprada hoy (valor − coste con comisiones)" });
  }
  return out.sort((a, b) => (Number.isNaN(b.eur) ? -Infinity : b.eur) - (Number.isNaN(a.eur) ? -Infinity : a.eur));
}

export function buildAcademyPrompt(args: {
  exp: Experiment;
  period: string;
  since: Date;
  snapshots: Row[];
  journal: Row[];
  orders: Row[];
  reports: Row[];
  previousPlaybook: string | null;
  previousReviews: Row[]; // revisiones anteriores de la academia (más reciente primero)
}): string {
  const L: string[] = [];
  const cap = args.exp.config.initialCapital;
  L.push(`# Revisión diaria del ${args.period} (${args.exp.name})`);
  const snaps = args.snapshots;
  const first = snaps.find((s) => new Date(s.at) >= args.since) ?? snaps[0];
  const before = [...snaps].reverse().find((s) => new Date(s.at) < args.since) ?? first;
  const last = snaps.at(-1);
  if (before && last) {
    const bench = "MSCI_WORLD";
    const portRet = Number(last.total_eur) / Number(before.total_eur) - 1;
    const benchRet = before.benchmarks?.[bench] && last.benchmarks?.[bench] ? Number(last.benchmarks[bench]) / Number(before.benchmarks[bench]) - 1 : null;
    L.push("## RESULTADO DEL DÍA");
    L.push(`Cartera: ${Number(before.total_eur).toFixed(2)} € → ${Number(last.total_eur).toFixed(2)} € (${pc(portRet)}).`);
    for (const b of BENCHMARKS) {
      const v0 = before.benchmarks?.[b.code];
      const v1 = last.benchmarks?.[b.code];
      if (v0 !== undefined && v1 !== undefined) L.push(`- ${b.name}: ${pc(Number(v1) / Number(v0) - 1)} hoy; ${pc(Number(v1) / cap - 1)} desde el inicio`);
    }
    if (benchRet !== null) L.push(`Diferencia hoy frente al MSCI World: ${((portRet - benchRet) * 100).toFixed(2)} puntos.`);
    const cashW = Number(before.cash_eur) / Number(before.total_eur);
    if (benchRet !== null) L.push(`Efecto del efectivo: había un ${pc(cashW)} en efectivo; frente a estar invertido como el MSCI World supone unos ${(-cashW * benchRet * 100).toFixed(2)} puntos.`);
    L.push(`Desde el inicio: cartera ${pc(Number(last.total_eur) / cap - 1)}.`);
    L.push("");
    L.push("## ATRIBUCIÓN POR POSICIÓN (aportación en EUR entre la valoración anterior y la de cierre)");
    const attr = dailyAttribution(before, last);
    if (!attr.length) L.push("Sin posiciones: todo en efectivo.");
    for (const a of attr) L.push(`- ${a.symbol}: ${Number.isNaN(a.eur) ? "?" : `${a.eur >= 0 ? "+" : ""}${a.eur.toFixed(2)} €`} (${a.note})`);
    L.push("");
    L.push("## ÚLTIMOS CIERRES (fecha · cartera · MSCI World)");
    for (const s of snaps.filter((x) => x.kind === "close" || x.kind === "start").slice(-10))
      L.push(`- ${s.snapshot_date} · ${Number(s.total_eur).toFixed(2)} € · ${s.benchmarks?.MSCI_WORLD !== undefined ? `${Number(s.benchmarks.MSCI_WORLD).toFixed(2)} €` : "?"}`);
    L.push(`Posiciones al cierre: ${((last.holdings ?? []) as Row[]).map((h) => `${h.symbol} ${((Number(h.valueEur) / Number(last.total_eur)) * 100).toFixed(1)} % (${((Number(h.valueEur) / Number(h.costEur) - 1) * 100).toFixed(1)} % vs coste)`).join(", ") || "ninguna"}`);
    L.push("");
  }
  const pm = [...args.reports].reverse().find((r) => r.agent === "quant_engine")?.content;
  if (pm?.postmortem?.trades?.length) {
    L.push("## POST-MORTEM DE OPERACIONES (desde cada operación, vs MSCI World)");
    L.push(`Acierto: ${pm.postmortem.hitRate === null ? "?" : pc(pm.postmortem.hitRate)}; exceso medio: ${pm.postmortem.avgExcess === null ? "?" : pc(pm.postmortem.avgExcess)}`);
    for (const t of pm.postmortem.trades as Row[])
      L.push(`- ${String(t.at).slice(0, 10)} ${t.side === "buy" ? "compra" : "venta"} ${t.symbol}: activo ${t.ret === null ? "?" : pc(t.ret)}, benchmark ${t.benchRet === null ? "?" : pc(t.benchRet)}, exceso ${t.excess === null ? "?" : pc(t.excess)}`);
    if (pm.risk) L.push(`Riesgo actual: volatilidad ${pc(pm.risk.annVol)}, VaR 95 % ${pc(pm.risk.var95_1d)}, beta ${pm.risk.beta ?? "?"}, máx. caída histórica ${pc(pm.risk.maxDrawdown)}`);
    L.push("");
  }
  L.push("## DECISIONES DEL DÍA (diario del gestor)");
  if (!args.journal.length) L.push("Ninguna.");
  for (const j of args.journal) L.push(`- [${String(j.at).slice(0, 16)}] ${short(j.summary, 400)}${j.thesis ? ` | Tesis: ${short(j.thesis, 800)}` : ""}${j.change_mind ? ` | Cambiaría si: ${short(j.change_mind, 300)}` : ""}`);
  L.push("");
  L.push("## ÓRDENES DEL DÍA");
  if (!args.orders.length) L.push("Ninguna.");
  for (const o of args.orders) L.push(`- ${String(o.at).slice(0, 16)} ${o.side} ${o.quantity} ${o.symbol}: ${o.status}${o.reject_reason ? ` (${o.reject_reason})` : ""}${o.rationale ? ` · Motivo: ${short(o.rationale, 300)}` : ""}`);
  L.push("");
  const memos = args.reports.filter((r) => r.agent === "quant_analyst" || r.agent === "risk_manager");
  if (memos.length) {
    L.push("## MEMOS DEL EQUIPO DEL DÍA");
    for (const r of memos) L.push(`- [${String(r.at).slice(0, 16)}] ${r.agent === "quant_analyst" ? "Analista cuantitativo" : "Gestora de riesgos"}: ${short(r.summary, 300)}`);
    L.push("");
  }
  L.push("## MANUAL DE ESTRATEGIA VIGENTE");
  L.push(args.previousPlaybook ?? "No hay: es la primera revisión. Redacta la primera versión.");
  if (args.previousReviews.length) {
    L.push("");
    L.push("## REVISIONES ANTERIORES (busca pautas que se repitan antes de cambiar reglas)");
    for (const r of args.previousReviews) {
      const c = (r.content ?? {}) as Row;
      L.push(`- ${r.period} · nota ${c.grade ?? "?"} · ${short(c.why ?? r.summary, 400)}`);
      for (const l of (c.lessons ?? []) as Row[]) L.push(`  · ${l.title}: ${short(l.lesson, 250)}`);
    }
  }
  L.push("");
  L.push("Explica por qué se ganó o se perdió hoy, saca lecciones y devuelve el JSON con el manual (cámbialo solo si la evidencia lo justifica).");
  return L.join("\n");
}

export async function runAcademy(args: { db: Db; exp: Experiment; day: string; log: (m: string) => void; dryRun?: boolean }): Promise<AcademyReport | null> {
  const { db, exp, log } = args;
  const period = args.day; // revisión diaria: el periodo es el día (YYYY-MM-DD)
  const existing = await db.from("agent_reports").select("id").eq("experiment_id", exp.id).eq("agent", "academy").eq("period", period).limit(1);
  if (existing.data?.length && !args.dryRun) {
    log(`Academia: el día ${period} ya estaba revisado.`);
    return null;
  }
  const [y, m, d] = args.day.split("-").map(Number);
  const since = zonedTimeToUtc(y, m, d, 0, 0, "Europe/Madrid"); // 00:00 de ese día en Madrid
  const until = zonedTimeToUtc(y, m, d + 1, 9, 0, "Europe/Madrid"); // incluye el cierre lanzado de madrugada
  const [snapshotsAll, journalAll, ordersAll, reportsAll] = await Promise.all([
    readAll(db, "snapshots", exp.id, "seq"),
    readAll(db, "journal_entries", exp.id, "seq"),
    readAll(db, "orders", exp.id, "seq"),
    readAll(db, "agent_reports", exp.id, "seq"),
  ]);
  const inDay = (r: Row) => new Date(r.at) >= since && new Date(r.at) < until;
  const snapshots = snapshotsAll.filter((s) => new Date(s.at) < until);
  if (!snapshots.some((s) => new Date(s.at) >= since)) {
    log(`Academia: sin valoraciones el ${period} (día sin mercado o sin ejecuciones). No hay nada que revisar.`);
    return null;
  }
  const previous = await latestPlaybook(db, exp.id);
  const prompt = buildAcademyPrompt({
    exp,
    period,
    since,
    snapshots,
    journal: journalAll.filter((j) => inDay(j) && (j.kind === "decision" || j.kind === "briefing")),
    orders: ordersAll.filter(inDay),
    reports: reportsAll.filter(inDay),
    previousPlaybook: previous?.playbook ?? null,
    previousReviews: reportsAll.filter((r) => r.agent === "academy" && r.period !== period).slice(-7).reverse(),
  });
  log(`Academia: revisando el día ${period} (${prompt.length} caracteres)...`);
  const { value, durationMs } = await callAgent({ schema: AcademySchema, system: SYSTEM, prompt, model: exp.model });
  log(`Academia (${(durationMs / 1000).toFixed(1)} s): nota ${value.grade}. ${value.summary}`);
  if (!args.dryRun) await saveReport(db, { experimentId: exp.id, runId: null, agent: "academy", period, summary: value.summary, content: value, model: exp.model, durationMs });
  return value;
}
