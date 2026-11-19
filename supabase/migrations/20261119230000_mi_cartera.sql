-- Mi cartera real (MyInvestor). Datos PERSONALES: solo los puede leer el propietario con sesión
-- iniciada (tabla app_owners). Ni el rol anon ni otros usuarios autenticados ven nada.
-- Escriben únicamente los scripts locales con la clave secreta.

create table public.app_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_owners enable row level security;
revoke all on public.app_owners from anon, authenticated;

create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_owners where user_id = auth.uid());
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_owner() to authenticated;

-- Posiciones actuales (una fila por fondo, ETF o acción). Se actualizan cuando compras o vendes.
create table public.pf_positions (
  id bigint generated always as identity primary key,
  isin text not null unique,
  ticker text,                     -- acciones y ETF (formato Yahoo); null en fondos
  yahoo_symbol text,               -- símbolo de Yahoo para el precio diario (también fondos), si se encuentra
  name text not null,
  kind text not null check (kind in ('fondo', 'etf', 'accion')),
  asset_class text not null,       -- p. ej. 'Renta variable global', 'Monetario'
  region text not null,
  theme text,                      -- p. ej. 'Índice', 'Value', 'Tecnología', 'Defensa'
  currency text not null default 'EUR' check (currency in ('EUR', 'USD')),
  quantity numeric not null check (quantity > 0),
  invested numeric not null,       -- en la divisa de la posición, como lo muestra MyInvestor
  avg_cost numeric not null,       -- coste medio por participación o título (divisa de la posición)
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Valoración diaria de cada posición (precio y valor en EUR). Una fila por posición y día.
create table public.pf_valuations (
  id bigint generated always as identity primary key,
  isin text not null references public.pf_positions(isin),
  price_date date not null,
  price numeric not null,          -- valor liquidativo o cotización (divisa de la posición)
  currency text not null,
  fx_eurusd numeric,               -- USD por 1 EUR si la posición está en USD
  quantity numeric not null,
  value_eur numeric not null,
  invested_eur numeric not null,
  source text not null,
  recorded_at timestamptz not null default now(),
  unique (isin, price_date)
);

-- Informe diario del comité de agentes (lo rellenará la revisión de las 22:20).
create table public.pf_reviews (
  id bigint generated always as identity primary key,
  review_date date not null unique,
  summary text not null,
  content jsonb not null,          -- veredicto por posición, alertas, riesgos, lecciones
  model text,
  recorded_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['pf_positions', 'pf_valuations', 'pf_reviews']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_owner())', t || '_owner_read', t);
  end loop;
end $$;

-- Nombre corto de cada posición para el gráfico del mensaje diario (2026-11-19).
alter table public.pf_positions add column short_name text;
