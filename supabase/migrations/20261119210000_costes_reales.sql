-- Costes de un inversor particular en España (decisión del usuario, 2026-11-19):
-- comisión de cambio EUR/USD 0,25 %, importe mínimo por operación 500 €, impuesto del 19 % sobre
-- dividendos y liquidación anual del IRPF del ahorro sobre las ganancias realizadas.

alter table public.experiments
  add column min_order_eur numeric not null default 500,
  add column dividend_tax_pct numeric not null default 0.19,
  add column capital_gains_tax boolean not null default true;
alter table public.experiments alter column fx_fee_pct set default 0.0025;

-- El experimento de prueba todavía no ha empezado: se le aplican ya los costes reales.
update public.experiments
  set fx_fee_pct = 0.0025, min_order_eur = 500, dividend_tax_pct = 0.19, capital_gains_tax = true
  where code = 'test-1' and started_at is null;

-- Las nuevas reglas también quedan congeladas al empezar el experimento.
create or replace function private.experiments_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'No se pueden borrar experimentos';
  end if;
  if old.started_at is not null and (
    new.started_at is distinct from old.started_at
    or new.code is distinct from old.code
    or new.mode is distinct from old.mode
    or new.initial_capital is distinct from old.initial_capital
    or new.base_currency is distinct from old.base_currency
    or new.commission_pct is distinct from old.commission_pct
    or new.commission_min is distinct from old.commission_min
    or new.slippage_pct is distinct from old.slippage_pct
    or new.fx_fee_pct is distinct from old.fx_fee_pct
    or new.max_position_pct is distinct from old.max_position_pct
    or new.allow_crypto is distinct from old.allow_crypto
    or new.allow_fractional is distinct from old.allow_fractional
    or new.risk_free_rate is distinct from old.risk_free_rate
    or new.max_quote_age_minutes is distinct from old.max_quote_age_minutes
    or new.min_order_eur is distinct from old.min_order_eur
    or new.dividend_tax_pct is distinct from old.dividend_tax_pct
    or new.capital_gains_tax is distinct from old.capital_gains_tax) then
    raise exception 'El experimento % ya empezó: sus reglas y su fecha de inicio son inmutables', old.code;
  end if;
  return new;
end $$;

-- Pago anual del IRPF del ahorro: se registra como evento corporativo de tipo 'tax'
-- (symbol = 'IRPF-<año fiscal>', ex_date = día del pago, amount_local = ganancia neta del año,
-- cash_eur = impuesto pagado, en negativo).
alter table public.corporate_actions drop constraint corporate_actions_kind_check;
alter table public.corporate_actions add constraint corporate_actions_kind_check
  check (kind in ('dividend', 'split', 'tax'));
