-- =====================================================================
-- Corrección de permisos: fallos 2 y 4 de la verificación
-- =====================================================================
-- Ejecutar DESPUÉS de los scripts 1, 2 y 3, y volver a ejecutar el
-- script 4 (verificación) al terminar.
--
-- Corrige dos cosas que la verificación detectó:
--
-- 2) `anon` seguía teniendo USAGE sobre el esquema `public`.
--    La migración anterior lo revocaba del rol `anon`, pero Postgres
--    concede USAGE al pseudo-rol `PUBLIC` por defecto, y `anon` lo hereda
--    de ahí. Hay que revocarlo de `PUBLIC` y volver a concederlo
--    explícitamente a los roles que sí lo necesitan.
--
-- 4) Quedaban 4 políticas con `using (true)`.
--    La migración anterior las eliminaba por nombre, así que sólo caían
--    las que ella misma conocía. Las creadas a mano desde el panel
--    sobrevivieron. Aquí se eliminan TODAS las políticas de las tablas
--    del sistema, sin depender del nombre, y se recrean sólo las
--    correctas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cerrar el acceso heredado de PUBLIC
-- ---------------------------------------------------------------------
revoke all    on all tables    in schema public from public;
revoke all    on all sequences in schema public from public;
revoke usage  on schema public from public;

revoke all    on all tables    in schema public from anon;
revoke all    on all sequences in schema public from anon;
revoke usage  on schema public from anon;

-- Devolver USAGE a los roles que sí deben tenerlo. Se comprueba que cada
-- rol exista antes de concedérselo, para no fallar en proyectos donde
-- alguno no esté presente.
do $$
declare
  r text;
begin
  foreach r in array array[
    'postgres',
    'authenticated',
    'service_role',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_storage_admin',
    'supabase_realtime_admin',
    'supabase_replication_admin',
    'dashboard_user',
    'authenticator'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on schema public to %I', r);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Eliminar TODAS las políticas de las tablas del sistema
-- ---------------------------------------------------------------------
-- Sin depender del nombre: es la única forma de garantizar que no queda
-- ninguna política permisiva heredada.
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'organizaciones', 'perfiles', 'configuracion_negocio', 'secuencias_documento',
        'clientes', 'servicios', 'cotizaciones', 'cotizacion_items',
        'facturas', 'factura_items', 'prestamos', 'cuotas', 'pagos'
      )
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
    raise notice 'Política eliminada: % en %', p.policyname, p.tablename;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Recrear únicamente las políticas correctas
-- ---------------------------------------------------------------------
-- Organización: sólo la propia. Sin política de INSERT a propósito — las
-- organizaciones se crean a través de `crear_organizacion()`, que valida
-- que el usuario no tenga ya una.
create policy "org propia lectura" on public.organizaciones
  for select to authenticated
  using (id = (select public.org_actual()));

create policy "org propia actualizacion" on public.organizaciones
  for update to authenticated
  using (id = (select public.org_actual()))
  with check (id = (select public.org_actual()));

-- Perfiles: sólo los de la propia organización, y sólo lectura.
create policy "perfiles de mi organizacion" on public.perfiles
  for select to authenticated
  using (organizacion_id = (select public.org_actual()));

-- Tablas de datos: una política uniforme por organización.
-- `(select ...)` hace que la función se evalúe una vez por consulta en
-- lugar de una vez por fila.
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
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (organizacion_id = (select public.org_actual()))
         with check (organizacion_id = (select public.org_actual()))',
      'aislamiento por organizacion', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Asegurar que el RLS sigue activo en las trece tablas
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizaciones', 'perfiles', 'configuracion_negocio', 'secuencias_documento',
    'clientes', 'servicios', 'cotizaciones', 'cotizacion_items',
    'facturas', 'factura_items', 'prestamos', 'cuotas', 'pagos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Restituir los permisos de tabla al rol autenticado
-- ---------------------------------------------------------------------
-- El `revoke ... from public` del paso 1 también afecta a `authenticated`,
-- que hereda de PUBLIC. Se le vuelven a conceder de forma explícita.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- Las funciones de negocio siguen siendo ejecutables sólo por usuarios
-- autenticados. A propósito NO se hace un `revoke ... on all functions
-- from public`: eso alcanzaría también a las funciones de extensiones
-- instaladas en `public` (uuid-ossp, pgcrypto) y podría romper cosas
-- ajenas a la aplicación. El script 1 ya revocó cada función de negocio
-- de `public` y `anon` de forma individual, y sin USAGE sobre el esquema
-- el rol anónimo no puede invocar nada de aquí en ningún caso.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.org_actual()',
    'public.crear_organizacion(text, text)',
    'public.siguiente_numero_documento(text)',
    'public.guardar_cotizacion(jsonb, jsonb)',
    'public.obtener_cotizacion(uuid)',
    'public.guardar_factura(jsonb, jsonb)',
    'public.obtener_factura(uuid)',
    'public.convertir_cotizacion_en_factura(uuid)',
    'public.registrar_pago_factura(uuid, numeric, text, text)',
    'public.guardar_prestamo(jsonb)',
    'public.obtener_prestamo(uuid)',
    'public.registrar_pago_cuota(uuid, numeric, text, text)',
    'public.recalcular_estado_prestamo(uuid)',
    'public.actualizar_atrasos()',
    'public.contar_historial_cliente(uuid)',
    'public.eliminar_cliente(uuid)'
  ]
  loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Estas dos son internas: no deben ser invocables desde la API.
revoke all on function public.validar_org_padre() from public, anon, authenticated;
revoke all on function public.calcular_totales(jsonb, boolean, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Resultado
-- ---------------------------------------------------------------------
select
  'Politicas activas en las tablas del sistema' as detalle,
  count(*)::text as valor
from pg_policies
where schemaname = 'public'
  and tablename in (
    'organizaciones', 'perfiles', 'configuracion_negocio', 'secuencias_documento',
    'clientes', 'servicios', 'cotizaciones', 'cotizacion_items',
    'facturas', 'factura_items', 'prestamos', 'cuotas', 'pagos'
  )
union all
select 'Politicas permisivas restantes (debe ser 0)',
       count(*)::text
from pg_policies
where schemaname = 'public' and (qual = 'true' or with_check = 'true')
union all
select 'anon conserva USAGE sobre public (debe ser false)',
       has_schema_privilege('anon', 'public', 'USAGE')::text;
