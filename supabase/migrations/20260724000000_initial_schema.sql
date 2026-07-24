-- Migración Inicial de Supabase con Mejores Prácticas de Postgres y Seguridad RLS

-- 1. Habilitar extensión UUID
create extension if not exists "uuid-ossp";

-- 2. Tabla Clientes
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

-- 3. Tabla Servicios (Catálogo)
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

-- 4. Tabla Cotizaciones
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

-- 5. Tabla Cotizacion Items
create table if not exists public.cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid references public.cotizaciones(id) on delete cascade,
  servicio_id uuid references public.servicios(id) on delete set null,
  descripcion text not null,
  cantidad numeric default 1,
  precio_unitario numeric default 0,
  importe numeric default 0
);

-- 6. Tabla Facturas
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

-- 7. Tabla Factura Items
create table if not exists public.factura_items (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid references public.facturas(id) on delete cascade,
  servicio_id uuid references public.servicios(id) on delete set null,
  descripcion text not null,
  cantidad numeric default 1,
  precio_unitario numeric default 0,
  importe numeric default 0
);

-- 8. Tabla Préstamos
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

-- 9. Tabla Cuotas
create table if not exists public.cuotas (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid references public.prestamos(id) on delete cascade,
  numero integer not null,
  fecha_vencimiento date not null,
  monto numeric not null,
  monto_pagado numeric default 0,
  estado text default 'pendiente'
);

-- 10. Tabla Pagos
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

-- ----------------------------------------------------
-- ÍNDICES DE CLAVES FORÁNEAS Y ESTADOS (Mejores Prácticas Postgres)
-- ----------------------------------------------------
create index if not exists idx_cotizaciones_cliente_id on public.cotizaciones(cliente_id);
create index if not exists idx_cotizacion_items_cotizacion_id on public.cotizacion_items(cotizacion_id);
create index if not exists idx_cotizacion_items_servicio_id on public.cotizacion_items(servicio_id);
create index if not exists idx_facturas_cliente_id on public.facturas(cliente_id);
create index if not exists idx_facturas_cotizacion_id on public.facturas(cotizacion_id);
create index if not exists idx_factura_items_factura_id on public.factura_items(factura_id);
create index if not exists idx_factura_items_servicio_id on public.factura_items(servicio_id);
create index if not exists idx_prestamos_cliente_id on public.prestamos(cliente_id);
create index if not exists idx_cuotas_prestamo_id on public.cuotas(prestamo_id);
create index if not exists idx_pagos_factura_id on public.pagos(factura_id);
create index if not exists idx_pagos_prestamo_id on public.pagos(prestamo_id);
create index if not exists idx_pagos_cuota_id on public.pagos(cuota_id);

-- ----------------------------------------------------
-- HABILITACIÓN DE SEGURIDAD RLS (Row Level Security)
-- ----------------------------------------------------
alter table public.clientes enable row level security;
alter table public.servicios enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.cotizacion_items enable row level security;
alter table public.facturas enable row level security;
alter table public.factura_items enable row level security;
alter table public.prestamos enable row level security;
alter table public.cuotas enable row level security;
alter table public.pagos enable row level security;

-- ----------------------------------------------------
-- POLÍTICAS RLS SEGÚN REGLAS DE SEGURIDAD DE SUPABASE
-- ----------------------------------------------------
-- Políticas para rol autenticado
create policy "Acceso completo clientes usuario" on public.clientes
  for all to authenticated
  using ((select auth.uid()) = user_id or user_id is null)
  with check ((select auth.uid()) = user_id or user_id is null);

create policy "Acceso completo servicios usuario" on public.servicios
  for all to authenticated
  using ((select auth.uid()) = user_id or user_id is null)
  with check ((select auth.uid()) = user_id or user_id is null);

create policy "Acceso completo cotizaciones usuario" on public.cotizaciones
  for all to authenticated
  using ((select auth.uid()) = user_id or user_id is null)
  with check ((select auth.uid()) = user_id or user_id is null);

create policy "Acceso completo cotizacion_items usuario" on public.cotizacion_items
  for all to authenticated using (true) with check (true);

create policy "Acceso completo facturas usuario" on public.facturas
  for all to authenticated
  using ((select auth.uid()) = user_id or user_id is null)
  with check ((select auth.uid()) = user_id or user_id is null);

create policy "Acceso completo factura_items usuario" on public.factura_items
  for all to authenticated using (true) with check (true);

create policy "Acceso completo prestamos usuario" on public.prestamos
  for all to authenticated
  using ((select auth.uid()) = user_id or user_id is null)
  with check ((select auth.uid()) = user_id or user_id is null);

create policy "Acceso completo cuotas usuario" on public.cuotas
  for all to authenticated using (true) with check (true);

create policy "Acceso completo pagos usuario" on public.pagos
  for all to authenticated using (true) with check (true);

-- Permisos explícitos para la Data API de Supabase
grant all on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
