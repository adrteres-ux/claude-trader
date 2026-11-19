@AGENTS.md

# Claude vs. el Mercado — simulador de inversión con dinero ficticio

Experimento: Claude gestiona una cartera de **10.000 € FICTICIOS** sobre precios reales del mercado.
Paper trading puro: **ningún bróker ni dinero real**. No es consejo financiero; el autor no replica las decisiones.

El usuario es estudiante de ingeniería y empieza de cero: explicar cada paso brevemente, dar comandos
listos para copiar en un solo bloque (PowerShell) y guías paso a paso para Supabase/Vercel/GitHub.
Fork de PolParis/claude-trader para clonarlo y mejorarlo (usuario: Adrià, adrteres-ux).
Este archivo es la fuente de verdad del estado del proyecto. Idioma: español.

## Reglas no negociables
- Coste 0 €: prohibida la API de Anthropic y cualquier servicio de pago. Solo Vercel Hobby, Supabase Free,
  GitHub (repo público, Actions) y datos gratuitos. **No usar Vercel Cron.**
- Claude decide con `claude -p` (suscripción Pro del usuario) desde un script local. En esa llamada Claude
  no tiene herramientas, ni MCP, ni red, ni acceso a la BD: solo el prompt → JSON.
- El motor de ejecución es código determinista (`src/core`), separado de Claude.
- Diario, órdenes, ejecuciones, eventos, snapshots, benchmarks: **append-only** (triggers + REVOKE) y con
  **hash encadenado** (trigger en BD, verificación independiente en TS).
- La clave secreta de Supabase solo en `.env.local` (local) y en secretos de GitHub Actions. Nunca en el
  frontend ni en el repo.

## Reglas del experimento (por defecto, configurables en la tabla `experiments`)
- Capital 10.000 €, divisa base EUR. Activos solo en **EUR o USD** (FX real EURUSD=X registrado en cada operación).
- Comisión 0,10 % (mín. 1 €), slippage 0,05 %, comisión de cambio 0 %. Sin apalancamiento, corto, derivados ni margen.
- Máx. 25 % de la cartera por activo (se comprueba al comprar; no se fuerza venta si sube por precio).
- Unidades enteras. Cripto desactivada.
- Mercados: EE. UU. (NYSE/Nasdaq/Arca/Cboe), Xetra, Euronext (París, Ámsterdam, Bruselas, Lisboa), BME.
  Exposición a China/India/LatAm/emergentes vía ADRs y ETFs cotizados en USD o EUR.
- Orden abierto + festivos: calendario propio (`src/core/calendar.ts`) **y** `marketState === REGULAR` de Yahoo.
- Órdenes: primero ventas, luego compras. Market → precio actual ± slippage. Limit → "como una persona normal":
  orden válida durante la sesión del día; si es ejecutable se ejecuta al momento, si no queda pendiente
  (reserva efectivo/acciones) y se comprueba con barras de 5 min en la siguiente ejecución o en el cierre;
  si el precio tocó el límite se ejecuta al precio límite, si no caduca al cierre del mercado.
- Claude solo puede operar tickers cuyos datos van en el prompt de esa ejecución (si no → rechazo).
- Dividendos en bruto (impuestos ignorados) y splits aplicados. Benchmarks: ETFs de acumulación.
- Sharpe con tipo libre de riesgo configurable (0 % por defecto).

## Arquitectura
- `src/core/` lógica pura y testeada (Vitest): calendario, comisiones, FX, motor, órdenes limitadas,
  cartera derivada del registro, benchmarks, métricas, hash canónico. La usan la web, el agente y el cierre.
- `src/app/` dashboard Next.js (App Router) — solo LEE de Supabase con la clave publicable (web pública, sin login).
- `agent/` scripts locales (NO se despliegan, ver `.vercelignore`): `run-agent`, `close-day`,
  `start-experiment`, `create-user`. Datos de mercado en `agent/lib/market/` (interfaz `MarketDataProvider`).
- `supabase/migrations/` SQL versionado (se aplica con el MCP de Supabase).
- `.github/workflows/close-day.yml` (solo manual; el cierre normal es la tarea CLOSE del PC) → snapshot de cierre diario (sin Claude) + caducidad de límites +
  dividendos/splits + ancla de hashes en `integrity/anchors.jsonl`.

## Infraestructura
- Supabase: proyecto `simulador-bolsa`, ref `vicxlxfktwoyagebsbvw`, región eu-central-1 (Frankfurt), org free.
- Repo: https://github.com/adrteres-ux/claude-trader (fork de PolParis/claude-trader, sin licencia: pedir permiso antes de publicar derivados).
- Datos: yahoo-finance2 (gratis, sin clave, no oficial). Retraso declarado por Yahoo: 15 min Xetra/BME/Nasdaq
  (campo `exchangeDataDelayedBy`), 0 Euronext Ámsterdam, 20 NYSE; se registra el retraso medido
  (fetched_at − regularMarketTime) en cada precio.
- Claude CLI: `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe` (variable `CLAUDE_BIN` para cambiarlo).
- Modelo del agente: `sonnet` (plan Pro); configurable en `experiments.agent_model`.
- Tareas programadas solo en el PC principal (L-V, hora de Madrid): P0 08:30 (preapertura: analiza Asia y
  deja un plan, SIN órdenes, journal kind `briefing`), S0 09:30 (apertura Europa), S1 16:30, S2 21:00 y CLOSE
  22:30 (cierre diario + academia los viernes). Horario único en `src/lib/schedule.ts` (ventanas incluidas).
  Decisión del usuario (2026-10-22): 4 reuniones al día; el portátil solo está enchufado algunas mañanas.
  El cierre ya no va en GitHub Actions (workflow solo manual); sin anclas de integridad automáticas.
- `npm run dev` / `npm run build` / `npm test`
- `npm run run-agent -- --slot P0|S0|S1|S2` (sin `--slot` = manual; `--briefing` = preapertura a mano; `--no-team` sin analistas)
- `npm run explain` (genera las explicaciones que falten), `npm run close-day`, `npm run start-experiment -- --code <code>`, `npm run create-user -- <email>`

## Estado de fases del clon (actualizado 2026-11-19)
- [x] 0. Fork en GitHub (adrteres-ux/claude-trader)
- [x] 1. Proyecto Supabase `simulador-bolsa` creado y 6 migraciones aplicadas (14 tablas, experimento `test-1`)
- [x] 2. En el PC: Node 20+, Git, Claude Code con sesión iniciada; `git clone`, `npm install`, `npm test`
- [x] 3. `.env.local` (copiar `.env.example` y añadir `SUPABASE_SECRET_KEY`)
- [x] 4. `npm run market-check` y `npm run run-agent -- --offline --force --print-prompt`
- [ ] 5. Primera ejecución real (`npm run run-agent`) con mercados abiertos
- [x] 6. Tareas programadas instaladas en el PC de Adrià (2026-11-19, con `scripts/windows/setup.ps1`)
- [x] 7. Web en Vercel: https://simulador-bolsa-five.vercel.app (proyecto `simulador-bolsa`, solo variables NEXT_PUBLIC_*)
- [ ] 8. Periodo de prueba (`test-1`) → experimento oficial
- [ ] 9. Mejoras propias (ver guía "Clon de Claude vs. el Mercado")

## Decisiones del clon
- Noticias solo de fuentes fiables (2026-11-19, petición del usuario): lista `TRUSTED_PUBLISHERS` en
  `agent/lib/market-data.ts` (Reuters, Bloomberg, AP, AFP, FT, WSJ/Dow Jones, Barron's, MarketWatch, CNBC,
  The Economist, Nikkei, Yahoo Finance). El resto se descarta y se anota en el log; el prompt muestra la fuente de cada titular.

- Mejora continua (2026-11-19, petición del usuario): la academia pasa de semanal a DIARIA (tarea CLOSE,
  `run-agent.ps1`). Explica por qué se ganó o perdió (atribución por posición vs MSCI World, efecto del
  efectivo), saca lecciones y actualiza el manual solo si la evidencia lo justifica (un día es ruido; las
  sospechas van a `experiments`). Periodo = día (YYYY-MM-DD). El gestor recibe las 3 últimas revisiones
  (`recentLessons`) en la sección LECCIONES RECIENTES.
- Más información para el gestor (2026-11-19): CALENDARIO con citas macro (Fed, BCE, IPC y empleo de EE. UU.,
  fechas oficiales en `src/core/macro-calendar.ts`, cubre hasta dic-2027: ampliar cada año) y resultados
  empresariales (`earningsTimestamp` de Yahoo); fundamentales (crecimiento de ventas y beneficio, margen
  operativo, deuda/patrimonio, ROE; `quoteSummary financialData`, caché diaria en `agent/.cache/fundamentals`);
  POSICIONES ABIERTAS con la tesis completa de la última compra; diario menos recortado (500/800/300).
- Costes reales de un inversor en España (2026-11-19, migración `20261119210000_costes_reales.sql`):
  comisión de cambio 0,25 %, importe mínimo 500 € por operación (motor: `MIN_ORDER_SIZE`, salvo vender la
  posición entera), dividendos netos de un 19 %, IRPF del ahorro (19/21/23/27/30 %, `src/core/taxes.ts`)
  pagado del efectivo en el primer cierre de cada año sobre la ganancia neta realizada del año anterior
  (evento `corporate_actions` kind `tax`, symbol `IRPF-<año>`). Benchmarks: ETF de acumulación, no pagan.
- Actualización automática (2026-11-19): `run-agent.ps1` hace `git pull --ff-only` antes de cada ejecución
  y `npm install` si cambia `package-lock.json`.

- Giro del proyecto (2026-11-19): además del laboratorio ficticio, "Mi cartera" con la cartera REAL del usuario
  en MyInvestor (fondos, ETF y acciones). Web entera con login (se recupera el de PolParis, commit f0bcf39^):
  usuario sin email → se guarda como `<usuario>@mi-cartera.local` en Supabase Auth; página /cuenta para cambiar
  la contraseña. Tablas `pf_positions`, `pf_valuations`, `pf_reviews` (migración `20261119230000_mi_cartera.sql`)
  legibles SOLO por los usuarios de `app_owners` (función `private.is_owner()`). Los datos personales NO van
  al repo (se cargan en la BD).
- Resumen diario de Mi cartera (2026-11-19): `npm run portfolio` (`agent/portfolio-review.ts`), tarea PF a las
  22:20 L-V. Precios de Yahoo (fondos buscados por ISIN, símbolo guardado en `pf_positions.yahoo_symbol`),
  cifras del día calculadas en código, referencias genéricas por temática/región (el repo es público: nada de
  ISIN ni importes en el código), titulares de fuentes fiables, UNA llamada a Claude para el porqué, guarda en
  `pf_valuations`/`pf_reviews` y envía por Telegram (`agent/lib/telegram.ts`; `npm run telegram-setup` guarda el
  chat). Si Claude falla (cupo), se envían solo las cifras. Opciones: --dry-run, --no-claude, --no-telegram.
- Mensajes de Telegram cortos y visuales (2026-11-19, petición del usuario, para TODOS a partir de ahora):
  `agent/lib/portfolio-message.ts` — cabecera con el día y el total, una frase de por qué, una línea por posición
  con el nombre del fondo como en MyInvestor (`pf_positions.short_name`), 🟢/🔴 y barra 🟩/🟥 (Telegram no
  permite colorear texto) y lo ganado/perdido en € y %, 2-3 posiciones explicadas, máx.
  3 noticias y 2 citas. Sin imágenes ni servicios externos (los datos no salen de Telegram).
- Precios de Mi cartera (2026-11-19): Yahoo va a menudo un día por detrás de MyInvestor en los valores
  liquidativos. Regla: el precio vigente es el MÁS RECIENTE entre Yahoo y lo guardado (nunca se retrocede);
  el día se calcula contra la última valoración guardada de un día anterior. Fondos: solo símbolos de
  Morningstar "0P…" (no cotizaciones de bolsa como `.SG`, que se desvían del VL). Posible mejora: fuente de VL
  más rápida (Morningstar).

## Historia heredada del proyecto original (PolParis)
- Las notas siguientes describen decisiones y problemas del proyecto original; siguen valiendo como referencia.

## Decisiones / notas
- Mandato del usuario (2026-10-18): Claude debe buscar acciones individuales de todo el mundo (China,
  emergentes...), no solo índices de EU/EE. UU. → regla 9 del system prompt + universo de 160 activos
  (ADRs en USD). Descartados: TCEHY (OTC), EBR (sin datos), SIFY (ilíquida).
- Explicaciones para principiantes (2026-10-19, petición del usuario: no sabe de inversión): tras cada
  ejecución, 2.ª llamada `claude -p` (`agent/lib/agent/explain.ts`) → tabla encadenada `explanations`
  (1 por run) → página `/explicaciones` (historia, reparto por país/tipo, glosario). Si falla, no afecta a
  las órdenes; se rellena con `npm run explain`.
- Equipo de agentes (2026-10-22, petición del usuario, inspirado en un "fondo gestionado por IA"):
  motor cuantitativo en código (`src/core/quant.ts`, `agent/lib/quant-report.ts`: riesgo, VaR/CVaR, beta,
  Monte Carlo bootstrap por bloques con deriva neutral del 5 %, estrés, correlaciones, contribución al
  riesgo, factores, post-mortem) → analista cuantitativo + gestora de riesgos (`agent/lib/agent/team.ts`,
  2 llamadas `claude -p` en paralelo, fallan sin bloquear) → gestor. Academia los viernes en la tarea
  CLOSE (`npm run academy`, `agent/lib/agent/academy.ts`): post-mortem + MANUAL DE ESTRATEGIA que lee el
  gestor. Todo en la tabla encadenada `agent_reports`. Web: `/oficina` (animación SVG) y `/cuantitativo`.
  Consumo: ~25 k tokens la decisión + ~10 k cada analista; prompt del gestor ~40 k caracteres.
- Decisión del usuario (2026-10-23): sin límite de operaciones por día/semana. Va en el system prompt del
  gestor, la academia y la gestora de riesgos (prevalece sobre el manual v1, que tenía "máx. 3-4 por semana").
- Web original: https://claude-trader-livid.vercel.app. La del clon: https://simulador-bolsa-five.vercel.app (despliegue automático al hacer push a main).
- Rama principal `main`. Repo público (GitHub Actions gratis + transparencia).
- `cacheComponents` desactivado en `next.config.ts`: la web es privada y dinámica (sesión en cada petición).
- `package.json` con `"type": "module"` (los scripts usan top-level await con tsx).
- PowerShell 5.1 estropea UTF-8 al editar con Get/Set-Content: editar archivos con las herramientas de
  archivo o bash; los `.ps1` solo en ASCII.
- Experimentos: `test-1` (prueba, arranca solo en la primera ejecución con Europa abierta) y el oficial
  (se crea y arranca con `npm run start-experiment -- --code oficial --create --name "..."`).
- La web muestra el experimento con `is_default` (o el elegido en el selector, cookie `exp`).
- Claude se llama con `--tools "" --strict-mcp-config --safe-mode --no-session-persistence --json-schema`
  desde una carpeta temporal vacía. Un único reintento solo si el JSON es inválido y antes de escribir nada.
- Ejecución: precios refrescados justo antes de ejecutar (no los del prompt).
- `run-agent.ps1` espera hasta 2 min a tener red (DNS) al despertar: el 23/10 la P0 falló con "fetch failed"
  porque el Wi-Fi aún no había conectado tras la suspensión.
- Franjas programadas con ventana (S1 16:25–18:00, S2 20:55–22:00): si Windows lanza la tarea tarde
  (PC dormido en batería, sin temporizadores de activación) no hace nada y el cierre la marca fallida.
- Cierre diario: GitHub puede lanzar el cron con horas de retraso → antes de las 09:00 de Madrid se cierra
  el día anterior (`closingDay` en close-day.ts). 19/10: el cierre de GitHub falló (paso "Comprobar
  secretos" añadido para diagnosticar); el del 20/10 se hizo a mano desde el PC.
- Anclas de integridad: solo las escribe GitHub Actions (`integrity/anchors.jsonl`); la página Integridad
  las compara con la BD.
