// Reúne todos los datos de mercado de una ejecución: cotizaciones del universo, contexto,
// histórico + indicadores y titulares.
import { computeIndicators, type DailyClose } from "@/core/indicators";
import { BASE_UNIVERSE, MARKET_CONTEXT } from "@/core/universe";
import type { UniverseRow } from "./agent/prompt";
import type { MarketDataProvider, MarketQuote, NewsItem } from "./market/provider";
import { mapLimit } from "./market/yahoo";
import { FX_SYMBOL } from "./ops";

/**
 * Fuentes de noticias aceptadas (decisión del usuario, 2026-11-19: solo fuentes fiables).
 * Agencias y prensa económica con redacción propia. Se descartan agregadores, blogs de
 * recomendaciones y contenido patrocinado (Motley Fool, Zacks, Benzinga, InvestorPlace,
 * Simply Wall St, GuruFocus, Insider Monkey, TipRanks, 24/7 Wall St...).
 * Se compara sin distinguir mayúsculas y por inclusión, porque Yahoo escribe el nombre de formas distintas.
 */
export const TRUSTED_PUBLISHERS = [
  "reuters",
  "bloomberg",
  "associated press",
  "ap finance",
  "afp",
  "financial times",
  "wall street journal",
  "dow jones",
  "barron's",
  "marketwatch",
  "cnbc",
  "the economist",
  "nikkei",
  "yahoo finance",
];

export function isTrustedPublisher(publisher: string | null | undefined): boolean {
  if (!publisher) return false;
  const p = publisher.toLowerCase();
  return TRUSTED_PUBLISHERS.some((t) => p.includes(t));
}

export interface MarketSnapshot {
  quotes: Map<string, MarketQuote>;
  universe: UniverseRow[];
  context: { label: string; quote: MarketQuote | undefined }[];
  news: NewsItem[];
  regions: Map<string, string>;
  missing: string[];
  histories: Map<string, DailyClose[]>; // cierres diarios del último año (para el motor cuantitativo)
}

export async function gatherMarketData(
  provider: MarketDataProvider,
  opts: { held: string[]; watchlist: Map<string, string>; pending: string[]; allowCrypto: boolean; log: (m: string) => void },
): Promise<MarketSnapshot> {
  const regions = new Map(BASE_UNIVERSE.map((u) => [u.symbol, u.region]));
  const symbols = [...new Set([...BASE_UNIVERSE.map((u) => u.symbol), ...opts.watchlist.keys(), ...opts.held, ...opts.pending])];
  const quotes = await provider.getQuotes([...symbols, ...MARKET_CONTEXT.map((c) => c.symbol), FX_SYMBOL]);
  const missing = symbols.filter((s) => !quotes.get(s));
  if (missing.length) opts.log(`Sin cotización: ${missing.join(", ")}`);

  const tradable = symbols
    .map((s) => quotes.get(s))
    .filter((q): q is MarketQuote => !!q && !!q.market && (q.currency === "EUR" || q.currency === "USD"))
    .filter((q) => opts.allowCrypto || q.market !== "CRYPTO");

  const from = new Date(Date.now() - 400 * 86_400_000);
  const histories = new Map<string, DailyClose[]>();
  const indicators = await mapLimit(tradable, 6, async (q) => {
    try {
      const h = await provider.getDailyHistory(q.symbol, from);
      histories.set(q.symbol, h);
      return computeIndicators(h, q.price);
    } catch (e) {
      opts.log(`Sin histórico de ${q.symbol}: ${(e as Error).message}`);
      return null;
    }
  });

  // Fundamentales solo de acciones (los ETF no tienen ventas ni márgenes). Caché diaria en disco.
  const fundamentals = await mapLimit(tradable, 4, async (q) =>
    q.quoteType === "EQUITY" && provider.getFundamentals ? provider.getFundamentals(q.symbol).catch(() => null) : null,
  );
  const withFund = fundamentals.filter(Boolean).length;
  opts.log(`Fundamentales: ${withFund} de ${tradable.filter((q) => q.quoteType === "EQUITY").length} acciones`);

  const heldSet = new Set(opts.held);
  const universe: UniverseRow[] = tradable.map((q, i) => ({
    quote: q,
    region: regions.get(q.symbol) ?? (opts.watchlist.has(q.symbol) ? "Watchlist" : "Otros"),
    indicators: indicators[i],
    fundamentals: fundamentals[i],
    held: heldSet.has(q.symbol),
    watchlist: opts.watchlist.has(q.symbol),
  }));

  // Se piden más titulares de los necesarios porque después solo se quedan los de fuentes fiables.
  const newsQueries = ["stock market", "global economy", "central bank interest rates", ...opts.held.slice(0, 6)];
  const newsLists = await mapLimit(newsQueries, 3, (q) => provider.getNews(q, q.includes(" ") ? 20 : 8));
  const seen = new Set<string>();
  const all = newsLists.flat();
  const news = all
    .filter((n) => isTrustedPublisher(n.publisher))
    .filter((n) => n.title && !seen.has(n.title) && seen.add(n.title))
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, 18);
  const dropped = [...new Set(all.filter((n) => !isTrustedPublisher(n.publisher)).map((n) => n.publisher ?? "sin fuente"))];
  opts.log(`Noticias: ${news.length} de fuentes fiables; descartadas fuentes: ${dropped.join(", ") || "ninguna"}`);

  return {
    quotes,
    universe,
    context: MARKET_CONTEXT.map((c) => ({ label: c.label, quote: quotes.get(c.symbol) })),
    news,
    regions,
    missing,
    histories,
  };
}
