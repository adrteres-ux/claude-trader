// Construcción del prompt compacto que recibe Claude en cada ejecución.
import { MARKETS, sessionFor, zonedParts } from "@/core/calendar";
import type { Indicators } from "@/core/indicators";
import type { ExperimentConfig, MarketId } from "@/core/types";
import { upcomingMacroEvents } from "@/core/macro-calendar";
import type { Fundamentals, MarketQuote, NewsItem } from "../market/provider";

export function systemPrompt(cfg: ExperimentConfig, maxWatchlist: number): string {
  const pct = (x: number) => `${(x * 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
  return `Eres el gestor de una cartera de inversión SIMULADA (dinero ficticio, ${cfg.initialCapital.toLocaleString("es-ES")} € iniciales, divisa base EUR) en un experimento público llamado "Claude vs. el Mercado". Tu objetivo es maximizar la rentabilidad AJUSTADA AL RIESGO a medio plazo frente a los benchmarks (MSCI World, S&P 500, Euro Stoxx 50 y efectivo), no el número de operaciones.

Reglas estrictas:
1. Usa SOLO los datos incluidos en el mensaje. Prohibido usar precios, cifras, noticias o hechos de tu memoria. Si un dato no está, trátalo como desconocido.
2. Solo puedes operar los símbolos de la tabla UNIVERSO de este mensaje. Cualquier otro se rechaza.
3. Solo contado: sin apalancamiento, cortos, derivados ni margen. Unidades enteras. No puedes vender lo que no tienes.
4. Máximo ${pct(cfg.maxPositionPct)} del valor total de la cartera en un solo activo (contando lo que compres). Puedes quedarte en efectivo si lo justificas.
5. Cada operación paga comisión de ${pct(cfg.commissionPct)} (mínimo ${cfg.commissionMin} €) y slippage de ${pct(cfg.slippagePct)}${cfg.fxFeePct ? ` y comisión de cambio de ${pct(cfg.fxFeePct)}` : ""}. ${cfg.minOrderEur > 0 ? ` Cada operación debe ser de al menos ${cfg.minOrderEur.toLocaleString("es-ES")} € (solo se permite menos para vender una posición entera); las menores se rechazan.` : ""}${cfg.dividendTaxPct > 0 ? ` Los dividendos llegan netos de un ${pct(cfg.dividendTaxPct)} de impuesto.` : ""}${cfg.capitalGainsTax ? " Eres un inversor residente en España: cada enero se paga del efectivo el IRPF del ahorro (19 % hasta 6.000 €, 21 % hasta 50.000 €...) sobre las ganancias netas realizadas el año anterior; las pérdidas realizadas en el mismo año compensan. Vender con beneficio tiene un coste fiscal que mantener no tiene." : ""} Evita sobreoperar y las operaciones pequeñas en las que la comisión mínima pesa mucho.
6. Solo se ejecutan órdenes de mercados ABIERTOS ahora (ver MERCADOS). Las de mercados cerrados se rechazan.
7. "market" se ejecuta al precio actual con slippage. "limit" es válida hasta el cierre de la sesión de hoy: si el precio actual la cumple se ejecuta ya; si no, queda pendiente reservando efectivo o acciones, y si el precio no la toca caduca al cierre.
8. Las ventas se ejecutan antes que las compras y su efectivo sirve para las compras de esta misma ejecución. Deja margen para comisiones y tipo de cambio: los precios en USD se convierten a EUR con el EUR/USD indicado.
9. Mandato del propietario de la cartera: no te limites a fondos indexados de Europa y EE. UU. Busca activamente oportunidades en ACCIONES INDIVIDUALES de todo el mundo (China, India, Brasil, México, Argentina, Corea, Taiwán, Japón, Israel, Sudáfrica, sudeste asiático...) además de EE. UU. y Europa, eligiéndolas según su comportamiento reciente, su histórico y su valoración. Diversifica por regiones, sectores y tipos de activo. Puedes asumir más riesgo en emergentes, China o tecnología si los datos lo justifican; explica en el diario por qué eliges cada mercado y cada empresa. Los ETF de país sirven para exposición amplia, pero no deben sustituir la selección de empresas concretas cuando veas oportunidades.
10. Trabajas con un equipo: un motor cuantitativo (código: riesgo, Monte Carlo, estrés, factores, post-mortem), un analista cuantitativo y una gestora de riesgos, y una academia que cada día, tras el cierre, analiza por qué la cartera ganó o perdió, extrae lecciones y actualiza el MANUAL DE ESTRATEGIA. Lee las LECCIONES RECIENTES y aplícalas: el objetivo es mejorar día a día sin repetir errores. Sus memos son consejos: la decisión es tuya, pero si no sigues al equipo o al manual, explica por qué en la tesis. Sigue las reglas del manual salvo que los datos de hoy justifiquen lo contrario. Decisión del propietario: NO hay límite al número de operaciones por día ni por semana: si el manual tiene un tope de operaciones, ignóralo (sí debes seguir evitando operaciones que no compensen sus costes).
11. Combina posiciones estratégicas (meses o años) con posiciones tácticas (días o semanas) cuando los datos lo justifiquen. Para cada posición táctica, deja escrito en la tesis el objetivo y el nivel en el que saldrías, y revísalos en cada ejecución. No operes por operar: cada operación cuesta comisión y slippage.
12. Escribe SIEMPRE el diario completo aunque no hagas ninguna orden. Sé concreto y cita cifras del mensaje. Escribe en español.
13. watchlist_changes: puedes añadir (máximo ${maxWatchlist} extra) o quitar símbolos de Yahoo Finance de bolsas de EE. UU., Xetra, Euronext o BME que coticen en EUR o USD. Aparecerán en el UNIVERSO desde la próxima ejecución; no puedes operarlos antes.
14. Ten en cuenta el CALENDARIO (resultados empresariales y citas macro): los días de resultados y de decisiones de bancos centrales los precios se mueven más. Si una posición presenta resultados pronto, decide de forma explícita si la mantienes, la reduces o esperas, y explícalo.
15. En POSICIONES ABIERTAS tienes la tesis con la que compraste cada una. Revísala: si se ha cumplido, si ha fallado o si sigue vigente. No mantengas una posición cuya tesis ya no se sostiene.
16. Responde únicamente con el JSON del esquema.`;
}

export interface UniverseRow {
  quote: MarketQuote;
  region: string;
  indicators: Indicators | null;
  fundamentals?: Fundamentals | null;
  held: boolean;
  watchlist: boolean;
}

export interface PromptInput {
  now: Date;
  slotLabel: string;
  experimentName: string;
  startedAt: Date | null;
  initialCapital: number;
  eurUsd: number | null;
  cashEur: number;
  totalEur: number;
  positions: { symbol: string; quantity: number; avgPriceLocal: number; priceLocal: number; currency: string; valueEur: number; pnlPct: number; weightPct: number }[];
  pending: { symbol: string; side: string; quantity: number; limitPrice: number; expiresAt: Date }[];
  benchmarks: Record<string, number>;
  benchmarkNames: Record<string, string>;
  pendingNotes: string[];
  lastOrders: { at: string; symbol: string; side: string; quantity: number; status: string; reason: string | null }[];
  journal: { at: string; kind: string; summary: string; thesis: string | null; change_mind: string | null }[];
  context: { label: string; quote: MarketQuote | undefined }[];
  news: NewsItem[];
  universe: UniverseRow[];
  team?: string; // informe cuantitativo, memos del equipo y manual de la academia
  briefing?: boolean; // reunión de preapertura: sin órdenes
  positionTheses?: { symbol: string; boughtAt: string; rationale: string | null; thesis: string | null; changeMind: string | null }[];
  lessons?: string; // lecciones y análisis de la última revisión diaria de la academia
  taxNote?: string; // plusvalías realizadas en el año e impuesto estimado
}

const f1 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "" : x.toFixed(1));
const pctStr = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "" : (x * 100).toFixed(1));
const price = (x: number) => (x >= 1000 ? x.toFixed(1) : x >= 10 ? x.toFixed(2) : x.toFixed(3));
const madrid = (d: Date) => {
  const p = zonedParts(d, "Europe/Madrid");
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};
const trunc = (s: string | null | undefined, n: number) => (!s ? "" : s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function marketStatusLines(now: Date): string[] {
  return (["US", "XETRA", "EURONEXT", "BME"] as MarketId[]).map((m) => {
    const s = sessionFor(m, now);
    if (!s) return `- ${MARKETS[m].name}: CERRADO (festivo o fin de semana)`;
    if (now < s.open) return `- ${MARKETS[m].name}: CERRADO (abre a las ${madrid(s.open).slice(11)} hora de Madrid)`;
    if (now >= s.close) return `- ${MARKETS[m].name}: CERRADO (cerró a las ${madrid(s.close).slice(11)})`;
    return `- ${MARKETS[m].name}: ABIERTO hasta las ${madrid(s.close).slice(11)} hora de Madrid`;
  });
}

export function buildPrompt(p: PromptInput): string {
  const L: string[] = [];
  const ret = p.totalEur / p.initialCapital - 1;
  L.push(`# EJECUCIÓN ${p.slotLabel} — ${madrid(p.now)} (hora de Madrid) — ${p.experimentName}`);
  L.push(`Inicio del experimento: ${p.startedAt ? madrid(p.startedAt) : "hoy"}. EUR/USD: ${p.eurUsd ?? "sin dato"} (USD por 1 EUR).`);
  L.push("");
  if (p.briefing) {
    L.push("## REUNIÓN DE PREAPERTURA (08:30)");
    L.push("Las bolsas en las que puedes operar todavía están CERRADAS: hoy NO se ejecuta ninguna orden en esta reunión (deja \"orders\" vacío). Analiza cómo ha ido la sesión asiática (Hang Seng, Shanghái, Nikkei, Nifty en el CONTEXTO) y los titulares de la noche, y escribe en el diario un PLAN concreto para la reunión de las 09:30 (apertura de Europa): qué comprarías o venderías, a qué precio aproximado y en qué condiciones. Tu yo de las 09:30 leerá este plan en el diario.");
    L.push("");
  }
  L.push("## MERCADOS");
  L.push(...marketStatusLines(p.now));
  L.push("");
  L.push("## CARTERA");
  L.push(`Valor total: ${p.totalEur.toFixed(2)} € (${pctStr(ret)} % desde el inicio). Efectivo: ${p.cashEur.toFixed(2)} € (${pctStr(p.cashEur / p.totalEur)} %).`);
  const bm = Object.entries(p.benchmarks)
    .map(([code, v]) => `${p.benchmarkNames[code] ?? code}: ${v.toFixed(2)} € (${pctStr(v / p.initialCapital - 1)} %)`)
    .join(" | ");
  if (bm) L.push(`Benchmarks: ${bm}`);
  if (p.taxNote) L.push(p.taxNote);
  if (p.positions.length) {
    L.push("símbolo;cantidad;precio_medio;precio_actual;divisa;valor_eur;pyg_%;peso_%");
    for (const x of p.positions)
      L.push(`${x.symbol};${x.quantity};${price(x.avgPriceLocal)};${price(x.priceLocal)};${x.currency};${x.valueEur.toFixed(2)};${f1(x.pnlPct)};${f1(x.weightPct)}`);
  } else L.push("Sin posiciones (todo en efectivo).");
  if (p.pending.length) {
    L.push("Órdenes limitadas pendientes (reservan efectivo/acciones):");
    for (const o of p.pending) L.push(`- ${o.side} ${o.quantity} ${o.symbol} límite ${o.limitPrice} (caduca ${madrid(o.expiresAt)})`);
  }
  if (p.pendingNotes.length) {
    L.push("Novedades desde la última ejecución:");
    for (const n of p.pendingNotes) L.push(`- ${n}`);
  }
  L.push("");
  if (p.lastOrders.length) {
    L.push("## RESULTADO DE TUS ÚLTIMAS ÓRDENES");
    for (const o of p.lastOrders) L.push(`- ${o.at} ${o.side} ${o.quantity} ${o.symbol}: ${o.status}${o.reason ? ` (${o.reason})` : ""}`);
    L.push("");
  }
  if (p.positionTheses?.length) {
    L.push("## POSICIONES ABIERTAS: POR QUÉ LAS COMPRASTE (tesis completa de la última compra)");
    for (const t of p.positionTheses) {
      L.push(`- ${t.symbol} (última compra ${t.boughtAt})`);
      if (t.rationale) L.push(`  Motivo de la orden: ${trunc(t.rationale, 800)}`);
      if (t.thesis) L.push(`  Tesis de ese día: ${trunc(t.thesis, 1500)}`);
      if (t.changeMind) L.push(`  Saldrías si: ${trunc(t.changeMind, 500)}`);
    }
    L.push("");
  }
  if (p.lessons) {
    L.push("## LECCIONES RECIENTES DE LA ACADEMIA (revisión diaria de aciertos y errores)");
    L.push(p.lessons.trim());
    L.push("");
  }
  const today = madrid(p.now).slice(0, 10);
  const macro = upcomingMacroEvents(today, 14);
  const dayMs = 86_400_000;
  const earnings = p.universe
    .filter((u) => u.quote.earningsDate && u.quote.earningsDate.getTime() >= p.now.getTime() - dayMs)
    .filter((u) => u.quote.earningsDate!.getTime() - p.now.getTime() <= (u.held || u.watchlist ? 21 : 7) * dayMs)
    .sort((a, b) => a.quote.earningsDate!.getTime() - b.quote.earningsDate!.getTime());
  L.push("## CALENDARIO (próximos días)");
  if (!macro.length && !earnings.length) L.push("Sin citas macro ni resultados relevantes en los próximos días.");
  for (const e of macro) L.push(`- ${e.date} ${e.time} · ${e.region} · ${e.name}`);
  for (const u of earnings)
    L.push(`- ${madrid(u.quote.earningsDate!).slice(0, 10)} · Resultados de ${u.quote.symbol} (${trunc(u.quote.name, 28)})${u.held ? " · EN CARTERA" : u.watchlist ? " · watchlist" : ""}`);
  L.push("");
  L.push("## TU DIARIO RECIENTE (más antiguo primero)");
  if (!p.journal.length) L.push("(vacío: es tu primera ejecución)");
  for (const j of p.journal) {
    const tag = j.kind === "decision" ? "" : j.kind === "briefing" ? "(plan de preapertura) " : `(${j.kind}) `;
    L.push(`- [${j.at}] ${tag}${trunc(j.summary, 500)}`);
    if (j.thesis) L.push(`  Tesis: ${trunc(j.thesis, 800)}`);
    if (j.change_mind) L.push(`  Cambiaría si: ${trunc(j.change_mind, 300)}`);
  }
  L.push("");
  L.push("## CONTEXTO DE MERCADO (no operable)");
  for (const c of p.context) {
    if (!c.quote) continue;
    L.push(`- ${c.label}: ${price(c.quote.price)} (${f1(c.quote.changePct)} % última sesión)`);
  }
  L.push("");
  if (p.news.length) {
    L.push("## TITULARES RECIENTES (solo agencias y prensa económica fiables, vía Yahoo Finance; pueden ser incompletos)");
    for (const n of p.news) L.push(`- ${n.publishedAt ? madrid(n.publishedAt) : ""} ${n.publisher ? `(${n.publisher}) ` : ""}${trunc(n.title, 160)}${n.tickers.length ? ` [${n.tickers.slice(0, 4).join(",")}]` : ""}`);
    L.push("");
  }
  if (p.team) {
    L.push(p.team.trim());
    L.push("");
  }
  L.push("## UNIVERSO OPERABLE");
  L.push("Rentabilidades en %. var1d = variación de la última sesión. vol3m = volatilidad anualizada 3 meses. vsMM200 = precio vs media 200 sesiones. dMax52 = distancia al máximo de 52 semanas. capB = capitalización en miles de millones de la divisa. Fundamentales (solo acciones, último año): crVtas = crecimiento de ventas %, crBen = crecimiento del beneficio %, mOp = margen operativo %, deuda = deuda/patrimonio en veces, ROE %. result = fecha (mes-día) de los próximos resultados si son en menos de 30 días. *=en cartera, +=watchlist.");
  L.push("símbolo;nombre;región;div;mercado;abierto;precio;var1d;5d;1m;3m;6m;1a;ytd;vol3m;rsi14;vsMM200;dMax52;PER;PERfwd;divY;capB;crVtas;crBen;mOp;deuda;ROE;result");
  const now = p.now;
  for (const u of p.universe) {
    const q = u.quote;
    const i = u.indicators;
    const s = q.market ? sessionFor(q.market, now) : null;
    const open = !!s && now >= s.open && now < s.close && q.marketState === "REGULAR";
    L.push(
      [
        `${u.held ? "*" : ""}${u.watchlist ? "+" : ""}${q.symbol}`,
        trunc(q.name, 28),
        u.region,
        q.currency,
        q.market,
        open ? "sí" : "no",
        price(q.price),
        f1(q.changePct),
        pctStr(i?.ret5d),
        pctStr(i?.ret1m),
        pctStr(i?.ret3m),
        pctStr(i?.ret6m),
        pctStr(i?.ret1y),
        pctStr(i?.ytd),
        pctStr(i?.vol3m),
        f1(i?.rsi14),
        pctStr(i?.vsSma200),
        pctStr(i?.fromHigh52w),
        f1(q.trailingPE),
        f1(q.forwardPE),
        f1(q.dividendYield),
        q.marketCap ? (q.marketCap / 1e9).toFixed(0) : "",
        pctStr(u.fundamentals?.revenueGrowth),
        pctStr(u.fundamentals?.earningsGrowth),
        pctStr(u.fundamentals?.operatingMargin),
        u.fundamentals?.debtToEquity === null || u.fundamentals?.debtToEquity === undefined ? "" : u.fundamentals.debtToEquity.toFixed(1),
        pctStr(u.fundamentals?.returnOnEquity),
        q.earningsDate && q.earningsDate.getTime() >= now.getTime() - 86_400_000 && q.earningsDate.getTime() - now.getTime() <= 30 * 86_400_000
          ? madrid(q.earningsDate).slice(5, 10)
          : "",
      ].join(";"),
    );
  }
  L.push("");
  L.push("Decide ahora. Devuelve el JSON con journal, orders y watchlist_changes.");
  return L.join("\n");
}
