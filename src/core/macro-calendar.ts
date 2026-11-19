// Calendario macro: citas oficiales que mueven los mercados. Fechas fijas copiadas de las fuentes
// oficiales (revisar cada año y añadir el siguiente):
// - Fed (FOMC): https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
//   y la revisión del 12/11/2026 (https://www.federalreserve.gov/newsevents/pressreleases/monetary20261112a.htm):
//   la reunión del 26-27/10/2027 es solo de estrategia (sin decisión) y la última de 2027 pasa al 16-17/11.
// - BCE: https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html
// - EE. UU. IPC y empleo (BLS): https://www.bls.gov/schedule/news_release/cpi.htm y empsit.htm
// Horas en hora local de Madrid (aproximadas: los cambios de horario de EE. UU. y Europa no coinciden).
// Revisado el 19/11/2026. Fechas posteriores a diciembre de 2027: añadir cuando se publiquen.

export interface MacroEvent {
  date: string; // YYYY-MM-DD (día de la publicación o de la decisión)
  time: string; // hora aproximada de Madrid
  region: "EE. UU." | "Zona euro";
  name: string;
}

const fed = (dates: string[]): MacroEvent[] =>
  dates.map((date) => ({ date, time: "20:00", region: "EE. UU.", name: "Fed (FOMC): decisión de tipos y rueda de prensa" }));
const ecb = (dates: string[]): MacroEvent[] =>
  dates.map((date) => ({ date, time: "14:15", region: "Zona euro", name: "BCE: decisión de tipos (rueda de prensa 14:45)" }));
const cpi = (dates: string[]): MacroEvent[] =>
  dates.map((date) => ({ date, time: "14:30", region: "EE. UU.", name: "IPC (inflación) de EE. UU." }));
const jobs = (dates: string[]): MacroEvent[] =>
  dates.map((date) => ({ date, time: "14:30", region: "EE. UU.", name: "Informe de empleo de EE. UU. (nóminas y paro)" }));

export const MACRO_EVENTS: MacroEvent[] = [
  // Día de la decisión (segundo día de la reunión).
  ...fed(["2026-12-09", "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-11-17"]),
  { date: "2027-10-27", time: "—", region: "EE. UU.", name: "Fed (FOMC): reunión solo de estrategia, sin decisión de tipos" },
  ...ecb(["2026-12-17", "2027-02-04", "2027-03-18", "2027-04-29", "2027-06-10", "2027-07-22", "2027-09-09", "2027-10-28", "2027-12-16"]),
  ...cpi([
    "2026-12-10", "2027-01-13", "2027-02-11", "2027-03-10", "2027-04-13", "2027-05-12", "2027-06-10",
    "2027-07-14", "2027-08-11", "2027-09-14", "2027-10-14", "2027-11-10", "2027-12-10",
  ]),
  ...jobs([
    "2026-12-04", "2027-01-08", "2027-02-05", "2027-03-05", "2027-04-02", "2027-05-07", "2027-06-04",
    "2027-07-02", "2027-08-06", "2027-09-03", "2027-10-08", "2027-11-05", "2027-12-03",
  ]),
].sort((a, b) => a.date.localeCompare(b.date));

/** Citas desde `today` (YYYY-MM-DD, incluido) hasta `days` días después. */
export function upcomingMacroEvents(today: string, days = 14): MacroEvent[] {
  const end = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return MACRO_EVENTS.filter((e) => e.date >= today && e.date <= end);
}

/** Último día cubierto por el calendario (para avisar cuando haya que ampliarlo). */
export const MACRO_CALENDAR_END = MACRO_EVENTS.reduce((m, e) => (e.date > m ? e.date : m), "");
