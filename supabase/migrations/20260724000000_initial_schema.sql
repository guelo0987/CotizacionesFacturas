create extension if not exists "uuid-ossp";

-- 1. Tabla Clientes
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  nombre text not null,
  telefono text,
  email text,
  direccion text,
  documento text,
  notas text,
  created_at timestamp with time zone default now()
);

-- 2. Tabla Servicios
create table if not exists public.servicios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  nombre text not null,
  categoria text default 'otros',
  descripcion text,
  precio_base numeric default 0,
  unidad text default 'servicio',
  activo boolean default true,
  created_at timestamp with time zone default now()
);

-- 3. Tabla Cotizaciones
create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  cliente_id uuid references public.clientes(id) on delete cascade,
  numero text not null,
  fecha date default current_date,
  validez_dias integer default 15,
  estado text default 'borrador',
  subtotal numeric default 0,
  aplica_itbis boolean default true,
  itbis numeric default 0,
  total numeric default 0,
  notas text,
  created_at timestamp with time zone default now()
);

-- 4. Tabla Cotizacion Items
create table if not exists public.cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid references public.cotizaciones(id) on delete cascade,
  servicio_id uuid references public.servicios(id) on delete set null,
  descripcion text not null,
  cantidad numeric default 1,
  precio_unitario numeric default 0,
  importe numeric default 0
);

-- 5. Tabla Facturas
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  cliente_id uuid references public.clientes(id) on delete cascade,
  cotizacion_id uuid references public.cotizaciones(id) on delete set null,
  numero text not null,
  ncf text,
  fecha date default current_date,
  estado text default 'pendiente',
  subtotal numeric default 0,
  aplica_itbis boolean default true,
  itbis numeric default 0,
  total numeric default 0,
  monto_pagado numeric default 0,
  saldo_pendiente numeric default 0,
  notas text,
  created_at timestamp with time zone default now()
);

-- 6. Tabla Factura Items
create table if not exists public.factura_items (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid references public.facturas(id) on delete cascade,
  servicio_id uuid references public.servicios(id) on delete set null,
  descripcion text not null,
  cantidad numeric default 1,
  precio_unitario numeric default 0,
  importe numeric default 0
);

-- 7. Tabla Préstamos
create table if not exists public.prestamos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  cliente_id uuid references public.clientes(id) on delete cascade,
  monto_prestado numeric not null,
  tasa_interes numeric not null,
  interes_total numeric not null,
  total_a_pagar numeric not null,
  num_cuotas integer not null,
  frecuencia text default 'mensual',
  fecha_inicio date default current_date,
  estado text default 'activo',
  created_at timestamp with time zone default now()
);

-- 8. Tabla Cuotas
create table if not exists public.cuotas (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid references public.prestamos(id) on delete cascade,
  numero integer not null,
  fecha_vencimiento date not null,
  monto numeric not null,
  monto_pagado numeric default 0,
  estado text default 'pendiente'
);

-- 9. Tabla Pagos
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid references public.facturas(id) on delete cascade,
  prestamo_id uuid references public.prestamos(id) on delete cascade,
  cuota_id uuid references public.cuotas(id) on delete set null,
  monto numeric not null,
  fecha timestamp with time zone default now(),
  metodo text default 'efectivo',
  referencia text,
  created_at timestamp with time zone default now()
);

-- Índices de Rendimiento (Postgres Best Practices)
create index if not exists idx_cotizaciones_cliente_id on public.cotizaciones(cliente_id);
create index if not exists idx_cotizacion_items_cotizacion_id on public.cotizacion_items(cotizacion_id);
create index if not exists idx_facturas_cliente_id on public.facturas(cliente_id);
create index if not exists idx_factura_items_factura_id on public.factura_items(factura_id);
create index if not exists idx_prestamos_cliente_id on public.prestamos(cliente_id);
create index if not exists idx_cuotas_prestamo_id on public.cuotas(prestamo_id);
create index if not exists idx_pagos_factura_id on public.pagos(factura_id);
create index if not exists idx_pagos_prestamo_id on public.pagos(prestamo_id);

-- RLS & Permisos Flexibles
alter table public.clientes enable row level security;
alter table public.servicios enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.cotizacion_items enable row level security;
alter table public.facturas enable row level security;
alter table public.factura_items enable row level security;
alter table public.prestamos enable row level security;
alter table public.cuotas enable row level security;
alter table public.pagos enable row level security;

drop policy if exists "Permitir todo clientes" on public.clientes;
drop policy if exists "Permitir todo servicios" on public.servicios;
drop policy if exists "Permitir todo cotizaciones" on public.cotizaciones;
drop policy if exists "Permitir todo cotizacion_items" on public.cotizacion_items;
drop policy if exists "Permitir todo facturas" on public.facturas;
drop policy if exists "Permitir todo factura_items" on public.factura_items;
drop policy if exists "Permitir todo prestamos" on public.prestamos;
drop policy if exists "Permitir todo cuotas" on public.cuotas;
drop policy if exists "Permitir todo pagos" on public.pagos;

create policy "Permitir todo clientes" on public.clientes for all using (true) with check (true);
create policy "Permitir todo servicios" on public.servicios for all using (true) with check (true);
create policy "Permitir todo cotizaciones" on public.cotizaciones for all using (true) with check (true);
create policy "Permitir todo cotizacion_items" on public.cotizacion_items for all using (true) with check (true);
create policy "Permitir todo facturas" on public.facturas for all using (true) with check (true);
create policy "Permitir todo factura_items" on public.factura_items for all using (true) with check (true);
create policy "Permitir todo prestamos" on public.prestamos for all using (true) with check (true);
create policy "Permitir todo cuotas" on public.cuotas for all using (true) with check (true);
create policy "Permitir todo pagos" on public.pagos for all using (true) with check (true);

grant all on all tables in schema public to anon, authenticated;
