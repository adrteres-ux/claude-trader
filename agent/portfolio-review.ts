// Resumen diario de MI CARTERA real (MyInvestor): `npm run portfolio` (tarea de las 22:20, L-V).
// 1. Lee tus posiciones de Supabase (tablas pf_*, privadas).
// 2. Precio de cada posición en Yahoo (fondos por ISIN; el símbolo encontrado se guarda) y EUR/USD.
// 3. Calcula EN CÓDIGO cuánto ha ganado o perdido hoy cada posición y el total.
// 4. Referencias del día (índices y valores parecidos a cada posición) y titulares de fuentes fiables.
// 5. UNA llamada a Claude para explicar el porqué en lenguaje sencillo (sin inventar cifras).
// 6. Guarda la valoración y el informe en Supabase y te lo envía por Telegram.
// Opciones: --dry-run (no guarda ni envía; imprime el mensaje), --no-claude (solo números), --no-telegram.
import { z } from "zod";
import { madridDate } from "@/core/calendar";
import { upcomingMacroEvents } from "@/core/macro-calendar";
import { callAgent } from "./lib/agent/team";
import { adminClient } from "./lib/db";
import { isTrustedPublisher } from "./lib/market-data";
import type { MarketQuote, NewsItem } from "./lib/market/provider";
import { YahooProvider, mapLimit } from "./lib/market/yahoo";
import { buildPortfolioMessage } from "./lib/portfolio-message";
import { sendTelegram, telegramConfigured } from "./lib/telegram";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
const dryRun = flag("dry-run");

// ---------- Referencias del día según el tipo de posición (genéricas: el repo es público) ----------
const REF_NAMES: Record<string, string> = {
  URTH: "MSCI World (ETF en USD)",
  "^GSPC": "S&P 500",
  "^IXIC": "Nasdaq",
  SMH: "Semiconductores (ETF SMH)",
  "^STOXX": "Stoxx Europe 600",
  "^STOXX50E": "Euro Stoxx 50",
  EEM: "Emergentes (ETF EEM)",
  "^HSI": "Hang Seng (Hong Kong)",
  "^NSEI": "Nifty 50 (India)",
  "RHM.DE": "Rheinmetall",
  "LDO.MI": "Leonardo",
  "HO.PA": "Thales",
  "SAAB-B.ST": "Saab",
  "BA.L": "BAE Systems",
  "EURUSD=X": "EUR/USD",
  "^VIX": "VIX (volatilidad)",
  "^TNX": "Bono EE. UU. 10 años",
};

function refsFor(p: Row): string[] {
  const r: string[] = [];
  const theme = String(p.theme ?? "").toLowerCase();
  const region = String(p.region ?? "").toLowerCase();
  if (p.kind === "accion" && p.ticker) r.push(String(p.ticker));
  if (theme.includes("tecnolog")) r.push("^IXIC", "SMH");
  if (theme.includes("defensa")) r.push("RHM.DE", "LDO.MI", "HO.PA", "SAAB-B.ST", "BA.L");
  if (region.includes("emergent")) r.push("EEM", "^HSI", "^NSEI");
  if (region.includes("europa") || region.includes("zona euro")) r.push("^STOXX", "^STOXX50E");
  if (region.includes("global")) r.push("URTH", "^GSPC");
  if (region.includes("ee. uu.")) r.push("^GSPC", "^IXIC");
  return [...new Set(r)];
}

function newsQueriesFor(p: Row): string[] {
  const q: string[] = [];
  const theme = String(p.theme ?? "").toLowerCase();
  const region = String(p.region ?? "").toLowerCase();
  if (p.kind === "accion" && p.ticker) q.push(String(p.ticker));
  if (theme.includes("tecnolog")) q.push("technology stocks");
  if (theme.includes("defensa")) q.push("European defence stocks");
  if (theme.includes("value")) q.push("value stocks");
  if (region.includes("emergent")) q.push("emerging markets stocks");
  if (region.includes("europa")) q.push("European stocks");
  if (String(p.asset_class).toLowerCase().includes("monetario")) q.push("ECB interest rates");
  return q;
}

// ---------- Respuesta de Claude ----------
const text = (max: number) => z.string().trim().min(1).max(max);
const ReviewSchema = z
  .object({
    headline: text(140).describe("UNA frase corta: por qué la cartera subió o bajó hoy"),
    day_story: text(500).describe("Explicación del día en 2-3 frases cortas, con cifras del mensaje (para la web)"),
    positions: z
      .array(z.object({ isin: z.string().trim().min(1).max(20), why: text(140).describe("Por qué se movió (una frase muy corta)") }).strict())
      .max(3)
      .describe("Solo las 2-3 posiciones que más se han movido hoy en euros"),
    news: z
      .array(
        z
          .object({
            title: text(110).describe("Titular traducido al español, corto"),
            source: text(40),
            why_it_matters: text(200).describe("En una o dos frases cortas: qué ha pasado y cómo afecta a TUS posiciones"),
          })
          .strict(),
      )
      .max(3),
    tomorrow: z
      .array(text(140))
      .max(5)
      .describe("Qué se espera para la próxima sesión, unas 5 líneas cortas: citas del calendario, resultados y temas que pueden mover tus posiciones"),
  })
  .strict();
type Review = z.infer<typeof ReviewSchema>;

const SYSTEM = `Eres el analista personal de la cartera de inversión de un particular (fondos, ETF y acciones en MyInvestor). Cada día laborable, tras el cierre de Europa y EE. UU., le explicas en español claro cómo le ha ido el día y POR QUÉ.
Reglas:
1. Usa SOLO los datos del mensaje: cifras de la cartera (ya calculadas), movimientos de los índices y valores de referencia, titulares y calendario. No inventes cifras, causas ni noticias. Puedes usar conocimiento general para decir qué es un fondo o un índice.
2. Para explicar cada posición, relaciónala con sus referencias (por ejemplo, un fondo de tecnología con el Nasdaq y los semiconductores; un fondo de defensa con Rheinmetall, Thales, Leonardo...). Si hay un titular que lo explique, cítalo. Si no hay una causa clara en los datos, dilo ("movimiento en línea con el mercado, sin noticia concreta").
3. Los fondos publican su valor liquidativo con retraso: si una posición dice "sin valor liquidativo nuevo", explícalo así y no inventes su movimiento.
4. Nada de recomendaciones de compra o venta: es un resumen informativo. Puedes señalar con neutralidad riesgos o concentraciones evidentes.
5. MUY breve y directo: el mensaje se lee en el móvil en menos de un minuto. Frases cortas, sin relleno ni repetir cifras que ya se ven.
6. "positions": solo las 2-3 posiciones que más se han movido hoy en euros. "news": como máximo 3 titulares de la lista, los más relevantes para ESTA cartera, traducidos al español, cada uno explicado en una o dos frases cortas (qué ha pasado y a qué posición afecta).
7. "tomorrow": unas 5 líneas sobre la PRÓXIMA SESIÓN usando la sección MAÑANA y el calendario: qué citas hay (bancos centrales, datos de inflación o empleo, resultados), a qué posiciones afectan y qué temas de las noticias siguen abiertos. No predigas si el mercado subirá o bajará: di qué se vigila y por qué importa.
8. Responde solo con el JSON del esquema.`;

// ---------- Formato ----------
const eurF = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = (v: number) => eurF.format(v);
const signedEur = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${eurF.format(Math.abs(v))}`;
const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`);
const shortName = (n: string) => {
  const s = n.replace(/^(Fidelity Funds|JPMorgan Funds) - /, "");
  return s.length > 48 ? `${s.slice(0, 47)}…` : s;
};
const dayLabel = (d: string) => new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Siguiente día laborable (lunes a viernes). */
function nextWeekday(d: string): string {
  let x = addDays(d, 1);
  while ([0, 6].includes(new Date(`${x}T12:00:00Z`).getUTCDay())) x = addDays(x, 1);
  return x;
}

interface PosDay {
  p: Row;
  symbol: string | null;
  price: number | null;
  priceDate: string | null;
  newData: boolean;
  valueEur: number;
  prevValueEur: number;
  dayEur: number;
  dayPct: number | null;
  investedEur: number;
  totalGainEur: number;
  note: string | null;
}

async function main() {
  const db = adminClient();
  const yahoo = new YahooProvider();
  const today = madridDate(new Date());
  log(`Resumen de Mi cartera · ${today}${dryRun ? " · SIN GUARDAR NI ENVIAR" : ""}`);

  const { data: posRows, error: pe } = await db.from("pf_positions").select("*").eq("active", true);
  if (pe) throw new Error(`Leer posiciones: ${pe.message}`);
  const positions = (posRows ?? []) as Row[];
  if (!positions.length) throw new Error("No hay posiciones en pf_positions.");
  const { data: valRows } = await db.from("pf_valuations").select("*").order("price_date");
  const lastVal = new Map<string, Row>();
  for (const v of (valRows ?? []) as Row[]) lastVal.set(v.isin, v);

  // Símbolo de Yahoo de cada posición (fondos por ISIN; se guarda para la próxima vez).
  for (const p of positions) {
    if (p.yahoo_symbol) continue;
    let sym: string | null = p.kind !== "fondo" && p.ticker ? String(p.ticker) : null;
    if (!sym) {
      const found = await yahoo.searchSymbols(p.isin);
      const pick = found.find((f) => f.quoteType === "MUTUALFUND") ?? found.find((f) => f.quoteType === "ETF") ?? found[0];
      sym = pick?.symbol ?? null;
      log(`Símbolo de ${p.name}: ${sym ?? "no encontrado en Yahoo"}`);
    }
    if (sym) {
      p.yahoo_symbol = sym;
      if (!dryRun) await db.from("pf_positions").update({ yahoo_symbol: sym }).eq("isin", p.isin);
    }
  }

  // Cotizaciones de las posiciones, referencias y EUR/USD.
  const refSymbols = [...new Set(positions.flatMap(refsFor))];
  const ownSymbols = positions.map((p) => p.yahoo_symbol).filter(Boolean) as string[];
  const quotes = await yahoo.getQuotes([...ownSymbols, ...refSymbols, "EURUSD=X", "^VIX", "^TNX"]);
  const fx = quotes.get("EURUSD=X");
  const fxNow = fx?.price ?? null;
  const fxPrev = fx?.previousClose ?? fxNow;

  const days: PosDay[] = positions.map((p) => {
    const q: MarketQuote | undefined = p.yahoo_symbol ? quotes.get(p.yahoo_symbol) : undefined;
    const lv = lastVal.get(p.isin);
    const qty = Number(p.quantity);
    const isUsd = p.currency === "USD";
    const rateNow = isUsd ? fxNow : 1;
    const ratePrev = isUsd ? fxPrev : 1;
    const investedEur = isUsd && rateNow ? Number(p.invested) / rateNow : Number(p.invested);
    const priceDate = q ? madridDate(q.quoteTime) : null;
    const newData = !!q && !!rateNow && (!lv || priceDate! > String(lv.price_date));
    if (!q || !rateNow) {
      const v = lv ? Number(lv.value_eur) : investedEur;
      return { p, symbol: p.yahoo_symbol ?? null, price: lv ? Number(lv.price) : null, priceDate: lv?.price_date ?? null, newData: false, valueEur: v, prevValueEur: v, dayEur: 0, dayPct: null, investedEur, totalGainEur: v - investedEur, note: "sin precio en Yahoo hoy" };
    }
    const valueEur = (qty * q.price) / rateNow;
    if (!newData) {
      return { p, symbol: p.yahoo_symbol, price: q.price, priceDate, newData, valueEur, prevValueEur: valueEur, dayEur: 0, dayPct: 0, investedEur, totalGainEur: valueEur - investedEur, note: `sin valor liquidativo nuevo (último: ${priceDate})` };
    }
    const prevPrice = q.previousClose ?? (lv ? Number(lv.price) : q.price);
    const prevValueEur = (qty * prevPrice) / (ratePrev || rateNow);
    return {
      p,
      symbol: p.yahoo_symbol,
      price: q.price,
      priceDate,
      newData,
      valueEur,
      prevValueEur,
      dayEur: valueEur - prevValueEur,
      dayPct: prevValueEur > 0 ? valueEur / prevValueEur - 1 : null,
      investedEur,
      totalGainEur: valueEur - investedEur,
      note: priceDate !== today ? `valor liquidativo del ${priceDate}` : null,
    };
  });
  days.sort((a, b) => b.valueEur - a.valueEur);
  const total = days.reduce((s, d) => s + d.valueEur, 0);
  const prevTotal = days.reduce((s, d) => s + d.prevValueEur, 0);
  const invested = days.reduce((s, d) => s + d.investedEur, 0);
  const dayEur = total - prevTotal;
  const dayPct = prevTotal > 0 ? total / prevTotal - 1 : 0;
  for (const d of days) log(`${d.p.name}: ${eur(d.valueEur)} (${signedEur(d.dayEur)}, ${pct(d.dayPct)})${d.note ? ` · ${d.note}` : ""}`);
  log(`Total: ${eur(total)} (${signedEur(dayEur)}, ${pct(dayPct)})`);

  // Titulares de fuentes fiables de las últimas ~36 h.
  const queries = [...new Set(["stock market", "Federal Reserve", "global economy", ...positions.flatMap(newsQueriesFor)])];
  const lists = await mapLimit(queries, 3, (q) => yahoo.getNews(q, 15));
  const since = Date.now() - 36 * 3_600_000;
  const seen = new Set<string>();
  const news: NewsItem[] = lists
    .flat()
    .filter((n) => isTrustedPublisher(n.publisher) && (!n.publishedAt || n.publishedAt.getTime() >= since))
    .filter((n) => n.title && !seen.has(n.title) && seen.add(n.title))
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, 25);
  log(`Titulares fiables: ${news.length}`);

  // Prompt con los datos ya calculados.
  const L: string[] = [];
  L.push(`# Cartera personal · cierre del ${today}`);
  L.push(`Total: ${eur(total)} · hoy ${signedEur(dayEur)} (${pct(dayPct)}) · invertido ${eur(invested)} · ganancia acumulada ${signedEur(total - invested)} (${pct(invested > 0 ? total / invested - 1 : null)})`);
  L.push("");
  L.push("## POSICIONES (isin; nombre; tipo; región; temática; peso; hoy €; hoy %; ganancia acumulada; nota)");
  for (const d of days)
    L.push(`${d.p.isin}; ${d.p.name}; ${d.p.kind}; ${d.p.region}; ${d.p.theme ?? d.p.asset_class}; ${((d.valueEur / total) * 100).toFixed(1)} %; ${signedEur(d.dayEur)}; ${pct(d.dayPct)}; ${signedEur(d.totalGainEur)}${d.note ? `; ${d.note}` : ""} · referencias: ${refsFor(d.p).join(", ") || "ninguna"}`);
  L.push("");
  L.push("## REFERENCIAS DEL DÍA (variación de la última sesión)");
  for (const s of [...refSymbols, "EURUSD=X", "^VIX", "^TNX"]) {
    const q = quotes.get(s);
    if (q) L.push(`- ${REF_NAMES[s] ?? s} (${s}): ${q.changePct === null ? "?" : `${q.changePct > 0 ? "+" : ""}${q.changePct.toFixed(2)} %`}`);
  }
  L.push("");
  L.push("## TITULARES DE FUENTES FIABLES (últimas 36 h)");
  if (!news.length) L.push("Ninguno.");
  for (const n of news) L.push(`- [${n.publisher}] ${n.title}${n.tickers.length ? ` (${n.tickers.slice(0, 4).join(", ")})` : ""}`);
  L.push("");
  const next = nextWeekday(today);
  L.push(`## MAÑANA (${next})`);
  const macroNext = upcomingMacroEvents(next, 0);
  if (!macroNext.length) L.push("Sin citas macro oficiales ese día en el calendario.");
  for (const e of macroNext) L.push(`- ${e.time} · ${e.region} · ${e.name}`);
  const earningsSoon = [...quotes.values()]
    .filter((q) => q.earningsDate && madridDate(q.earningsDate) >= today && madridDate(q.earningsDate) <= addDays(today, 7))
    .map((q) => `- Resultados de ${REF_NAMES[q.symbol] ?? q.name} (${q.symbol}): ${madridDate(q.earningsDate!)}`);
  if (earningsSoon.length) {
    L.push("Resultados empresariales próximos (posiciones y referencias):");
    L.push(...earningsSoon);
  }
  L.push("");
  L.push("## CALENDARIO (próximos 7 días)");
  const macro = upcomingMacroEvents(today, 7);
  if (!macro.length) L.push("Sin citas macro relevantes.");
  for (const e of macro) L.push(`- ${e.date} ${e.time} · ${e.region} · ${e.name}`);
  L.push("");
  L.push("Explica el día de esta cartera. Devuelve el JSON.");
  const prompt = L.join("\n");

  let review: Review | null = null;
  if (!flag("no-claude")) {
    try {
      const r = await callAgent({ schema: ReviewSchema, system: SYSTEM, prompt, model: process.env.PORTFOLIO_MODEL ?? "sonnet" });
      review = r.value;
      log(`Claude respondió en ${(r.durationMs / 1000).toFixed(1)} s: ${review.headline}`);
    } catch (e) {
      log(`Claude no respondió (${(e as Error).message}). Se envían solo las cifras.`);
    }
  }

  // Mensaje de Telegram: corto y visual (cifras del código + explicación de Claude).
  const why = new Map((review?.positions ?? []).map((x) => [x.isin, x.why]));
  const labelOf = (p: Row) => String(p.short_name ?? shortName(p.name));
  const message = buildPortfolioMessage({
    dateLabel: dayLabel(today),
    total,
    dayEur,
    dayPct,
    invested,
    positions: days.map((d) => ({ label: labelOf(d.p), dayEur: d.dayEur, dayPct: d.dayPct, valueEur: d.valueEur, stale: !d.newData })),
    headline: review?.headline ?? null,
    movers: days.filter((d) => why.has(d.p.isin)).map((d) => ({ label: labelOf(d.p), why: why.get(d.p.isin)! })),
    news: (review?.news ?? []).map((n) => ({ title: n.title, source: n.source, why: n.why_it_matters })),
    tomorrowLabel: dayLabel(nextWeekday(today)),
    tomorrow: review?.tomorrow ?? [],
  });

  if (dryRun) {
    console.log("\n===== MENSAJE (no enviado) =====\n" + message.replace(/<\/?(b|i|pre)>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    return;
  }

  // Guardar valoraciones nuevas e informe.
  const newVals = days
    .filter((d) => d.newData && d.price !== null && d.priceDate)
    .map((d) => ({
      isin: d.p.isin,
      price_date: d.priceDate,
      price: d.price,
      currency: d.p.currency,
      fx_eurusd: d.p.currency === "USD" ? fxNow : null,
      quantity: Number(d.p.quantity),
      value_eur: Math.round(d.valueEur * 100) / 100,
      invested_eur: Math.round(d.investedEur * 100) / 100,
      source: `Yahoo Finance (${d.symbol})`,
    }));
  if (newVals.length) {
    const { error } = await db.from("pf_valuations").upsert(newVals, { onConflict: "isin,price_date" });
    if (error) log(`No se pudieron guardar las valoraciones: ${error.message}`);
  }
  const content = {
    total: Math.round(total * 100) / 100,
    day_eur: Math.round(dayEur * 100) / 100,
    day_pct: dayPct,
    invested: Math.round(invested * 100) / 100,
    positions: days.map((d) => ({
      isin: d.p.isin,
      name: d.p.name,
      value_eur: Math.round(d.valueEur * 100) / 100,
      day_eur: Math.round(d.dayEur * 100) / 100,
      day_pct: d.dayPct,
      note: d.note,
      why: why.get(d.p.isin) ?? null,
    })),
    day_story: review?.day_story ?? null,
    news: review?.news ?? [],
    tomorrow: review?.tomorrow ?? [],
  };
  const summary = review ? `${review.headline} ${review.day_story}` : `Hoy ${signedEur(dayEur)} (${pct(dayPct)}). Valor ${eur(total)}.`;
  const { error: re } = await db
    .from("pf_reviews")
    .upsert({ review_date: today, summary, content, model: review ? (process.env.PORTFOLIO_MODEL ?? "sonnet") : null }, { onConflict: "review_date" });
  if (re) log(`No se pudo guardar el informe: ${re.message}`);

  if (flag("no-telegram")) return;
  if (!telegramConfigured()) {
    log("Telegram no está configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID): informe guardado solo en la web.");
    return;
  }
  await sendTelegram(message);
  log("Resumen enviado por Telegram.");
}

main().catch((e) => {
  log(`ERROR: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
