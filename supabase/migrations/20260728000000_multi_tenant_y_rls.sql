-- =====================================================================
-- Migración: aislamiento multi-inquilino y RLS real
-- =====================================================================
-- Sustituye por completo el modelo de permisos anterior, que tenía
-- políticas `using (true)` y `grant all ... to anon`: cualquiera con la
-- clave anónima (que viaja en el bundle del navegador) podía leer,
-- modificar y borrar los datos de todos los negocios sin autenticarse.
--
-- Modelo nuevo: cada negocio es una `organizacion`. Cada usuario de
-- `auth.users` pertenece a una organización a través de `perfiles`.
-- Todas las tablas de datos llevan `organizacion_id` y sus políticas
-- filtran por la organización del usuario autenticado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Cerrar el acceso público antes que nada
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on schema public from anon;

alter default privileges in schema public revoke all on tables from anon;

-- Eliminar las políticas permisivas del esquema anterior
drop policy if exists "Permitir todo clientes"          on public.clientes;
drop policy if exists "Permitir todo servicios"         on public.servicios;
drop policy if exists "Permitir todo cotizaciones"      on public.cotizaciones;
drop policy if exists "Permitir todo cotizacion_items"  on public.cotizacion_items;
drop policy if exists "Permitir todo facturas"          on public.facturas;
drop policy if exists "Permitir todo factura_items"     on public.factura_items;
drop policy if exists "Permitir todo prestamos"         on public.prestamos;
drop policy if exists "Permitir todo cuotas"            on public.cuotas;
drop policy if exists "Permitir todo pagos"             on public.pagos;

drop policy if exists "Acceso completo clientes"     on public.clientes;
drop policy if exists "Acceso completo servicios"    on public.servicios;
drop policy if exists "Acceso completo cotizaciones" on public.cotizaciones;
drop policy if exists "Acceso completo facturas"     on public.facturas;
drop policy if exists "Acceso completo prestamos"    on public.prestamos;

-- ---------------------------------------------------------------------
-- 1. Organizaciones y perfiles
-- ---------------------------------------------------------------------
create table if not exists public.organizaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(trim(nombre)) between 1 and 160),
  rnc         text check (rnc is null or rnc ~ '^[0-9]{9,11}$'),
  plan        text not null default 'prueba' check (plan in ('prueba', 'basico', 'pro')),
  estado      text not null default 'activa' check (estado in ('activa', 'suspendida', 'cancelada')),
  created_at  timestamptz not null default now()
);

create table if not exists public.perfiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  organizacion_id  uuid not null references public.organizaciones(id) on delete cascade,
  nombre           text,
  rol              text not null default 'propietario' check (rol in ('propietario', 'empleado')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_perfiles_organizacion_id on public.perfiles(organizacion_id);

-- ---------------------------------------------------------------------
-- 2. Función de resolución de organización
-- ---------------------------------------------------------------------
-- `security definer` para que las políticas puedan consultar `perfiles`
-- sin provocar recursión infinita al evaluar el RLS de esa misma tabla.
create or replace function public.org_actual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select organizacion_id from public.perfiles where id = (select auth.uid())
$$;

revoke all on function public.org_actual() from public, anon;
grant execute on function public.org_actual() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Añadir organizacion_id a todas las tablas de datos
-- ---------------------------------------------------------------------
alter table public.clientes         add column if not exists organizacion_id uuid references public.organizaciones(id) on delete cascade;
alter table public.servicios        add column if not exists organizacion_id uuid references public.organizaciones(id) on delete cascade;
alter table public.cotizaciones     add column if not exists organizacion_id uuid references public.organizaciones(id) on delete cascade;
alter table public.cotizacion_items add column if not exists organizacion_id uuid references public.organizaciones(id) on delete cascade;
alter table public.facturas         add column if not exists organizacion_id uuid references public.organizaciones(id) on delete cascade;
alter table public.factura_items    add column if not exists organizacion_id uuid references public.organizaciones(id) on delete cascade;
alter table public.prestamos        add column if not exists organizacion_id uuid references public.organizaciones(id) on delete cascade;
alter table public.cuotas           add column if not exists organizacion_id uuid references public.organizaciones(id) on delete cascade;
alter table public.pagos            add column if not exists organizacion_id uuid references public.organizaciones(id) on delete cascade;

-- ---------------------------------------------------------------------
-- 4. Migración de los datos existentes
-- ---------------------------------------------------------------------
-- Las filas creadas antes de esta migración no tienen organización. Se
-- agrupan todas bajo una organización inicial y se le asocian los
-- usuarios que ya existan en auth.users.
do $$
declare
  v_org uuid;
  v_huerfanas boolean;
begin
  select exists (
    select 1 from public.clientes     where organizacion_id is null
    union all select 1 from public.servicios    where organizacion_id is null
    union all select 1 from public.cotizaciones where organizacion_id is null
    union all select 1 from public.facturas     where organizacion_id is null
    union all select 1 from public.prestamos    where organizacion_id is null
    limit 1
  ) into v_huerfanas;

  if v_huerfanas or exists (select 1 from auth.users) then
    select id into v_org from public.organizaciones where nombre = 'Organización inicial' limit 1;

    if v_org is null then
      insert into public.organizaciones (nombre, plan) values ('Organización inicial', 'pro')
      returning id into v_org;
    end if;

    update public.clientes         set organizacion_id = v_org where organizacion_id is null;
    update public.servicios        set organizacion_id = v_org where organizacion_id is null;
    update public.cotizaciones     set organizacion_id = v_org where organizacion_id is null;
    update public.cotizacion_items set organizacion_id = v_org where organizacion_id is null;
    update public.facturas         set organizacion_id = v_org where organizacion_id is null;
    update public.factura_items    set organizacion_id = v_org where organizacion_id is null;
    update public.prestamos        set organizacion_id = v_org where organizacion_id is null;
    update public.cuotas           set organizacion_id = v_org where organizacion_id is null;
    update public.pagos            set organizacion_id = v_org where organizacion_id is null;

    insert into public.perfiles (id, organizacion_id, nombre, rol)
    select u.id, v_org, coalesce(u.raw_user_meta_data->>'nombre', u.email), 'propietario'
    from auth.users u
    where not exists (select 1 from public.perfiles p where p.id = u.id);
  end if;
end $$;

-- Ahora que no quedan filas sin organización, la columna pasa a obligatoria
-- con valor por defecto derivado del usuario autenticado.
alter table public.clientes         alter column organizacion_id set not null, alter column organizacion_id set default public.org_actual();
alter table public.servicios        alter column organizacion_id set not null, alter column organizacion_id set default public.org_actual();
alter table public.cotizaciones     alter column organizacion_id set not null, alter column organizacion_id set default public.org_actual();
alter table public.cotizacion_items alter column organizacion_id set not null, alter column organizacion_id set default public.org_actual();
alter table public.facturas         alter column organizacion_id set not null, alter column organizacion_id set default public.org_actual();
alter table public.factura_items    alter column organizacion_id set not null, alter column organizacion_id set default public.org_actual();
alter table public.prestamos        alter column organizacion_id set not null, alter column organizacion_id set default public.org_actual();
alter table public.cuotas           alter column organizacion_id set not null, alter column organizacion_id set default public.org_actual();
alter table public.pagos            alter column organizacion_id set not null, alter column organizacion_id set default public.org_actual();

-- La columna user_id del esquema anterior queda como traza de autoría,
-- nunca como mecanismo de aislamiento.
alter table public.clientes     alter column user_id drop default;
alter table public.servicios    alter column user_id drop default;
alter table public.cotizaciones alter column user_id drop default;
alter table public.facturas     alter column user_id drop default;
alter table public.prestamos    alter column user_id drop default;

create index if not exists idx_clientes_org         on public.clientes(organizacion_id);
create index if not exists idx_servicios_org        on public.servicios(organizacion_id);
create index if not exists idx_cotizaciones_org     on public.cotizaciones(organizacion_id);
create index if not exists idx_cotizacion_items_org on public.cotizacion_items(organizacion_id);
create index if not exists idx_facturas_org         on public.facturas(organizacion_id);
create index if not exists idx_factura_items_org    on public.factura_items(organizacion_id);
create index if not exists idx_prestamos_org        on public.prestamos(organizacion_id);
create index if not exists idx_cuotas_org           on public.cuotas(organizacion_id);
create index if not exists idx_pagos_org            on public.pagos(organizacion_id);

-- ---------------------------------------------------------------------
-- 5. Saneamiento de los datos heredados
-- ---------------------------------------------------------------------
-- Las restricciones de la sección 6 fallarían sobre datos que el código
-- anterior sí permitía crear. Se normalizan antes de imponerlas.

-- 5.1. Números de documento duplicados.
-- El cliente los generaba con `array.length + 1`, así que borrar un
-- documento hacía que el siguiente reutilizara un número ya emitido. Sin
-- esto, el índice único de más abajo aborta la migración entera.
do $$
declare
  r record;
begin
  for r in
    select id, numero, organizacion_id,
           row_number() over (partition by organizacion_id, numero order by created_at) as n
    from public.cotizaciones
  loop
    if r.n > 1 then
      update public.cotizaciones
      set numero = r.numero || '-DUP' || (r.n - 1)
      where id = r.id;
    end if;
  end loop;

  for r in
    select id, numero, organizacion_id,
           row_number() over (partition by organizacion_id, numero order by created_at) as n
    from public.facturas
  loop
    if r.n > 1 then
      update public.facturas
      set numero = r.numero || '-DUP' || (r.n - 1)
      where id = r.id;
    end if;
  end loop;
end $$;

-- 5.2. Pagos sin destino o con destino doble
delete from public.pagos where factura_id is null and prestamo_id is null;
update public.pagos set prestamo_id = null, cuota_id = null
where factura_id is not null and prestamo_id is not null;
delete from public.pagos where monto is null or monto <= 0;

-- 5.3. Importes y plazos fuera de rango
update public.cotizaciones set validez_dias = 15
where validez_dias is null or validez_dias < 1 or validez_dias > 365;

update public.cotizaciones set subtotal = greatest(coalesce(subtotal, 0), 0),
                               itbis    = greatest(coalesce(itbis, 0), 0),
                               total    = greatest(coalesce(total, 0), 0);

update public.facturas set subtotal        = greatest(coalesce(subtotal, 0), 0),
                           itbis           = greatest(coalesce(itbis, 0), 0),
                           total           = greatest(coalesce(total, 0), 0),
                           monto_pagado    = greatest(coalesce(monto_pagado, 0), 0),
                           saldo_pendiente = greatest(coalesce(saldo_pendiente, 0), 0);

update public.prestamos set num_cuotas = least(greatest(coalesce(num_cuotas, 1), 1), 120);
delete from public.prestamos where monto_prestado is null or monto_prestado <= 0;
update public.prestamos set tasa_interes = greatest(coalesce(tasa_interes, 0), 0);

update public.cuotas set monto_pagado = greatest(coalesce(monto_pagado, 0), 0);
delete from public.cuotas where monto is null or monto <= 0;

-- 5.4. Estados desconocidos
update public.cotizaciones set estado = 'borrador'
where estado is null or estado not in ('borrador', 'enviada', 'aceptada', 'rechazada', 'vencida');

update public.facturas set estado = 'pendiente'
where estado is null or estado not in ('pendiente', 'parcial', 'pagada', 'anulada');

update public.prestamos set estado = 'activo'
where estado is null or estado not in ('activo', 'saldado', 'atrasado');

update public.cuotas set estado = 'pendiente'
where estado is null or estado not in ('pendiente', 'parcial', 'pagada', 'atrasada');

update public.pagos set metodo = 'otro'
where metodo is null or metodo not in ('efectivo', 'transferencia', 'tarjeta', 'otro');

update public.prestamos set frecuencia = 'mensual'
where frecuencia is null or frecuencia not in ('semanal', 'quincenal', 'mensual');

-- 5.5. Documentos sin cliente: la clave foránea pasa a `restrict` y no
-- admite huérfanos apuntando a clientes ya borrados.
delete from public.cotizaciones where cliente_id is not null
  and not exists (select 1 from public.clientes c where c.id = cotizaciones.cliente_id);
delete from public.facturas where cliente_id is not null
  and not exists (select 1 from public.clientes c where c.id = facturas.cliente_id);
delete from public.prestamos where cliente_id is not null
  and not exists (select 1 from public.clientes c where c.id = prestamos.cliente_id);

-- ---------------------------------------------------------------------
-- 6. Integridad de negocio
-- ---------------------------------------------------------------------
-- Numeración correlativa única por organización (evita el número
-- duplicado que producía `array.length + 1` en el cliente).
create unique index if not exists uq_cotizaciones_numero_org on public.cotizaciones(organizacion_id, numero);
create unique index if not exists uq_facturas_numero_org     on public.facturas(organizacion_id, numero);

-- Estados válidos
alter table public.cotizaciones drop constraint if exists chk_cotizaciones_estado;
alter table public.cotizaciones add  constraint chk_cotizaciones_estado
  check (estado in ('borrador', 'enviada', 'aceptada', 'rechazada', 'vencida'));

alter table public.facturas drop constraint if exists chk_facturas_estado;
alter table public.facturas add  constraint chk_facturas_estado
  check (estado in ('pendiente', 'parcial', 'pagada', 'anulada'));

alter table public.prestamos drop constraint if exists chk_prestamos_estado;
alter table public.prestamos add  constraint chk_prestamos_estado
  check (estado in ('activo', 'saldado', 'atrasado'));

alter table public.cuotas drop constraint if exists chk_cuotas_estado;
alter table public.cuotas add  constraint chk_cuotas_estado
  check (estado in ('pendiente', 'pagada', 'parcial', 'atrasada'));

alter table public.pagos drop constraint if exists chk_pagos_metodo;
alter table public.pagos add  constraint chk_pagos_metodo
  check (metodo in ('efectivo', 'transferencia', 'tarjeta', 'otro'));

-- Un pago pertenece a una factura o a un préstamo, nunca a ninguno ni a ambos
alter table public.pagos drop constraint if exists chk_pagos_destino;
alter table public.pagos add  constraint chk_pagos_destino
  check ((factura_id is not null) <> (prestamo_id is not null));

-- Dinero no negativo
alter table public.pagos     drop constraint if exists chk_pagos_monto_positivo;
alter table public.pagos     add  constraint chk_pagos_monto_positivo check (monto > 0);
alter table public.cuotas    drop constraint if exists chk_cuotas_montos;
alter table public.cuotas    add  constraint chk_cuotas_montos check (monto > 0 and monto_pagado >= 0);
alter table public.prestamos drop constraint if exists chk_prestamos_montos;
alter table public.prestamos add  constraint chk_prestamos_montos
  check (monto_prestado > 0 and tasa_interes >= 0 and num_cuotas between 1 and 120);

alter table public.facturas drop constraint if exists chk_facturas_montos;
alter table public.facturas add  constraint chk_facturas_montos
  check (subtotal >= 0 and itbis >= 0 and total >= 0 and monto_pagado >= 0 and saldo_pendiente >= 0);

alter table public.cotizaciones drop constraint if exists chk_cotizaciones_montos;
alter table public.cotizaciones add  constraint chk_cotizaciones_montos
  check (subtotal >= 0 and itbis >= 0 and total >= 0 and validez_dias between 1 and 365);

-- Cantidades y precios de línea
alter table public.cotizacion_items drop constraint if exists chk_cotizacion_items_montos;
alter table public.cotizacion_items add  constraint chk_cotizacion_items_montos
  check (cantidad > 0 and precio_unitario >= 0 and importe >= 0);

alter table public.factura_items drop constraint if exists chk_factura_items_montos;
alter table public.factura_items add  constraint chk_factura_items_montos
  check (cantidad > 0 and precio_unitario >= 0 and importe >= 0);

-- Borrar un cliente no debe destruir su historial fiscal: se pasa de
-- `cascade` a `restrict` para que la aplicación tenga que decidir.
alter table public.cotizaciones drop constraint if exists cotizaciones_cliente_id_fkey;
alter table public.cotizaciones add  constraint cotizaciones_cliente_id_fkey
  foreign key (cliente_id) references public.clientes(id) on delete restrict;

alter table public.facturas drop constraint if exists facturas_cliente_id_fkey;
alter table public.facturas add  constraint facturas_cliente_id_fkey
  foreign key (cliente_id) references public.clientes(id) on delete restrict;

alter table public.prestamos drop constraint if exists prestamos_cliente_id_fkey;
alter table public.prestamos add  constraint prestamos_cliente_id_fkey
  foreign key (cliente_id) references public.clientes(id) on delete restrict;

-- Baja lógica de clientes con historial
alter table public.clientes add column if not exists activo boolean not null default true;

-- ---------------------------------------------------------------------
-- 7. Configuración del negocio (antes sólo vivía en localStorage)
-- ---------------------------------------------------------------------
create table if not exists public.configuracion_negocio (
  organizacion_id uuid primary key references public.organizaciones(id) on delete cascade,
  business_name   text not null default 'Mi Negocio',
  phone           text,
  email           text,
  address         text,
  documento       text,
  logo_url        text,
  itbis_rate      numeric not null default 18 check (itbis_rate >= 0 and itbis_rate <= 50),
  currency        text not null default 'RD$',
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. Secuencias de numeración por organización y año
-- ---------------------------------------------------------------------
create table if not exists public.secuencias_documento (
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  tipo            text not null check (tipo in ('cotizacion', 'factura')),
  anio            integer not null,
  ultimo          integer not null default 0,
  primary key (organizacion_id, tipo, anio)
);

-- Sembrar la secuencia con el correlativo más alto ya emitido. Sin esto
-- la numeración arrancaría en 0001 y el primer documento nuevo chocaría
-- contra el índice único de la sección 6.
insert into public.secuencias_documento (organizacion_id, tipo, anio, ultimo)
select
  organizacion_id,
  'cotizacion',
  coalesce(nullif(split_part(numero, '-', 2), '')::integer, extract(year from current_date)::integer),
  max(coalesce(nullif(regexp_replace(split_part(numero, '-', 3), '[^0-9]', '', 'g'), '')::integer, 0))
from public.cotizaciones
where numero ~ '^COT-[0-9]{4}-'
group by organizacion_id, split_part(numero, '-', 2)
on conflict (organizacion_id, tipo, anio)
do update set ultimo = greatest(public.secuencias_documento.ultimo, excluded.ultimo);

insert into public.secuencias_documento (organizacion_id, tipo, anio, ultimo)
select
  organizacion_id,
  'factura',
  coalesce(nullif(split_part(numero, '-', 2), '')::integer, extract(year from current_date)::integer),
  max(coalesce(nullif(regexp_replace(split_part(numero, '-', 3), '[^0-9]', '', 'g'), '')::integer, 0))
from public.facturas
where numero ~ '^FAC-[0-9]{4}-'
group by organizacion_id, split_part(numero, '-', 2)
on conflict (organizacion_id, tipo, anio)
do update set ultimo = greatest(public.secuencias_documento.ultimo, excluded.ultimo);

-- ---------------------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------------------
alter table public.organizaciones        enable row level security;
alter table public.perfiles              enable row level security;
alter table public.configuracion_negocio enable row level security;
alter table public.secuencias_documento  enable row level security;
alter table public.clientes              enable row level security;
alter table public.servicios             enable row level security;
alter table public.cotizaciones          enable row level security;
alter table public.cotizacion_items      enable row level security;
alter table public.facturas              enable row level security;
alter table public.factura_items         enable row level security;
alter table public.prestamos             enable row level security;
alter table public.cuotas                enable row level security;
alter table public.pagos                 enable row level security;

-- Deliberadamente NO se usa `force row level security`.
--
-- `force` somete también al dueño de la tabla (postgres) a las políticas.
-- Las funciones `security definer` de la siguiente migración se apoyan en
-- que el dueño sí las salta: `crear_organizacion` inserta en
-- `organizaciones` y en `perfiles`, tablas que a propósito no tienen
-- política de INSERT. Con `force` activo, el registro de cuentas nuevas
-- fallaría por completo.
--
-- No debilita el aislamiento: ni `anon` ni `authenticated` son dueños de
-- estas tablas, así que siguen sujetos al RLS en todo momento.

-- Organización: sólo la propia, y sólo lectura/actualización (nunca insert
-- directo — se crea a través de la función de alta)
drop policy if exists "org propia lectura"       on public.organizaciones;
drop policy if exists "org propia actualizacion" on public.organizaciones;
create policy "org propia lectura" on public.organizaciones
  for select to authenticated using (id = (select public.org_actual()));
create policy "org propia actualizacion" on public.organizaciones
  for update to authenticated using (id = (select public.org_actual())) with check (id = (select public.org_actual()));

-- Perfiles: sólo los de la propia organización
drop policy if exists "perfiles de mi organizacion" on public.perfiles;
create policy "perfiles de mi organizacion" on public.perfiles
  for select to authenticated using (organizacion_id = (select public.org_actual()));

-- Tablas de datos: una política uniforme por organización.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clientes', 'servicios', 'cotizaciones', 'cotizacion_items',
    'facturas', 'factura_items', 'prestamos', 'cuotas', 'pagos',
    'configuracion_negocio', 'secuencias_documento'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'aislamiento por organizacion', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (organizacion_id = (select public.org_actual()))
         with check (organizacion_id = (select public.org_actual()))',
      'aislamiento por organizacion', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. Coherencia padre-hijo entre organizaciones
-- ---------------------------------------------------------------------
-- Impide insertar una línea en un documento de otra organización, incluso
-- si el atacante manipula la petición.
create or replace function public.validar_org_padre()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_padre uuid;
begin
  if tg_table_name = 'cotizacion_items' then
    select organizacion_id into v_org_padre from public.cotizaciones where id = new.cotizacion_id;
  elsif tg_table_name = 'factura_items' then
    select organizacion_id into v_org_padre from public.facturas where id = new.factura_id;
  elsif tg_table_name = 'cuotas' then
    select organizacion_id into v_org_padre from public.prestamos where id = new.prestamo_id;
  elsif tg_table_name = 'pagos' then
    if new.factura_id is not null then
      select organizacion_id into v_org_padre from public.facturas where id = new.factura_id;
    else
      select organizacion_id into v_org_padre from public.prestamos where id = new.prestamo_id;
    end if;
  end if;

  if v_org_padre is null or v_org_padre is distinct from new.organizacion_id then
    raise exception 'El registro no pertenece a la organización del documento padre';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_org_padre on public.cotizacion_items;
create trigger trg_org_padre before insert or update on public.cotizacion_items
  for each row execute function public.validar_org_padre();

drop trigger if exists trg_org_padre on public.factura_items;
create trigger trg_org_padre before insert or update on public.factura_items
  for each row execute function public.validar_org_padre();

drop trigger if exists trg_org_padre on public.cuotas;
create trigger trg_org_padre before insert or update on public.cuotas
  for each row execute function public.validar_org_padre();

drop trigger if exists trg_org_padre on public.pagos;
create trigger trg_org_padre before insert or update on public.pagos
  for each row execute function public.validar_org_padre();

-- Postgres concede EXECUTE a PUBLIC en toda función nueva, así que una
-- función `security definer` en el esquema `public` queda expuesta como
-- endpoint de la API. Ésta sólo debe ejecutarse desde el disparador.
revoke all on function public.validar_org_padre() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. Permisos
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
