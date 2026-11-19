import { describe, expect, it } from "vitest";
import { executeOrders } from "../engine";
import { applyEvent, derivePortfolio } from "../portfolio";
import { realizedGainInYear, savingsTax } from "../taxes";
import { DEFAULT_CONFIG, type Instrument, type Quote } from "../types";

const NOW = new Date("2026-10-19T14:00:00Z"); // lunes, Xetra abierto
const inst: Instrument = { symbol: "SAP.DE", name: "SAP", market: "XETRA", currency: "EUR", kind: "stock", region: "test" };
const quote: Quote = {
  symbol: "SAP.DE",
  price: 200,
  currency: "EUR",
  source: "test",
  quoteTime: new Date(NOW.getTime() - 60_000),
  fetchedAt: NOW,
  declaredDelayMin: 0,
  marketState: "REGULAR",
};
const cfg = { ...DEFAULT_CONFIG, minOrderEur: 500 };
const run = (portfolio = derivePortfolio(10_000, []), orders: Parameters<typeof executeOrders>[0]["orders"]) =>
  executeOrders({
    config: cfg,
    now: NOW,
    portfolio,
    pending: [],
    instruments: new Map([["SAP.DE", inst]]),
    quotes: new Map([["SAP.DE", quote]]),
    fx: {},
    orders,
  });

describe("importe mínimo por operación", () => {
  it("rechaza una compra por debajo del mínimo", () => {
    const out = run(undefined, [{ symbol: "SAP.DE", side: "buy", quantity: 2, type: "market" }]); // ~400 €
    expect(out.results[0].status).toBe("rejected");
    expect(out.results[0].rejectCode).toBe("MIN_ORDER_SIZE");
  });
  it("acepta una compra por encima del mínimo", () => {
    const out = run(undefined, [{ symbol: "SAP.DE", side: "buy", quantity: 3, type: "market" }]); // ~600 €
    expect(out.results[0].status).toBe("filled");
  });
  it("permite vender una posición pequeña entera, pero no una parte", () => {
    const bought = run(undefined, [{ symbol: "SAP.DE", side: "buy", quantity: 3, type: "market" }]).portfolio;
    const partial = run(bought, [{ symbol: "SAP.DE", side: "sell", quantity: 2, type: "market" }]);
    expect(partial.results[0].rejectCode).toBe("MIN_ORDER_SIZE");
    const all = run(bought, [{ symbol: "SAP.DE", side: "sell", quantity: 3, type: "market" }]);
    expect(all.results[0].status).toBe("filled");
  });
});

describe("IRPF del ahorro", () => {
  it("aplica la escala por tramos", () => {
    expect(savingsTax(-500)).toBe(0);
    expect(savingsTax(1_000)).toBe(190);
    expect(savingsTax(6_000)).toBe(1_140);
    expect(savingsTax(10_000)).toBe(1_140 + 4_000 * 0.21);
    expect(savingsTax(350_000)).toBe(1_140 + 44_000 * 0.21 + 150_000 * 0.23 + 100_000 * 0.27 + 50_000 * 0.3);
  });
  it("compensa ganancias y pérdidas del mismo año", () => {
    const at = (d: string) => new Date(d);
    const trades = [
      { symbol: "A", at: at("2026-03-01"), quantity: 1, proceedsEur: 0, costEur: 0, pnlEur: 800 },
      { symbol: "B", at: at("2026-06-01"), quantity: 1, proceedsEur: 0, costEur: 0, pnlEur: -300 },
      { symbol: "C", at: at("2027-01-05"), quantity: 1, proceedsEur: 0, costEur: 0, pnlEur: 1_000 },
    ];
    expect(realizedGainInYear(trades, 2026)).toBe(500);
  });
  it("el pago del impuesto reduce el efectivo y se acumula", () => {
    const s = derivePortfolio(10_000, []);
    applyEvent(s, { type: "tax", at: new Date("2027-01-04"), year: 2026, cashEur: -95 });
    expect(s.cashEur).toBe(9_905);
    expect(s.taxesEur).toBe(95);
  });
});
