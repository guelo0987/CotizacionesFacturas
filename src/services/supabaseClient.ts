import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(url?: string, key?: string): SupabaseClient | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const targetUrl = url || envUrl;
  const targetKey = key || envKey;

  if (targetUrl && targetKey) {
    try {
      if (!supabaseClient) {
        supabaseClient = createClient(targetUrl, targetKey);
      }
      return supabaseClient;
    } catch (e) {
      console.error('Error initializing Supabase client:', e);
    }
  }
  return null;
}

export const SUPABASE_SQL_SCHEMA = `-- Copia y pega este script en el Editor SQL de tu proyecto en Supabase (https://app.supabase.com)

-- 1. Habilitar extensión UUID
create extension if not exists "uuid-ossp";

-- 2. Tabla Clientes
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  email text,
  direccion text,
  documento text,
  notas text,
  created_at timestamp with time zone default now()
);

-- 3. Tabla Servicios
create table if not exists public.servicios (
  id uuid primary key default gen_random_uuid(),
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

-- Configurar RLS (Row Level Security) opcional
alter table public.clientes enable row level security;
alter table public.servicios enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.facturas enable row level security;
alter table public.prestamos enable row level security;

-- Política de acceso público o autenticado
create policy "Acceso completo para usuarios autenticados" on public.clientes for all using (true);
create policy "Acceso completo servicios" on public.servicios for all using (true);
create policy "Acceso completo cotizaciones" on public.cotizaciones for all using (true);
create policy "Acceso completo facturas" on public.facturas for all using (true);
create policy "Acceso completo prestamos" on public.prestamos for all using (true);
`;
