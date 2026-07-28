-- =====================================================================
-- Verificación posterior al despliegue
-- =====================================================================
-- Este script NO modifica nada: sólo comprueba. Ejecútalo después de las
-- tres migraciones anteriores y revisa la columna `resultado`.
--
-- Todo debe decir OK. Si algo dice FALLO, no publiques la aplicación.
-- =====================================================================

with
-- 1. El rol anónimo no debe conservar ningún permiso sobre los datos.
-- Se consulta con `has_table_privilege`, que evalúa el permiso efectivo
-- (incluida la herencia de roles), en vez de las vistas de
-- information_schema, que sólo muestran las concesiones directas visibles
-- para quien ejecuta la consulta.
anon_tablas as (
  select count(*) as n
  from (
    select unnest(array[
      'public.organizaciones','public.perfiles','public.configuracion_negocio',
      'public.secuencias_documento','public.clientes','public.servicios',
      'public.cotizaciones','public.cotizacion_items','public.facturas',
      'public.factura_items','public.prestamos','public.cuotas','public.pagos'
    ]) as t
  ) x
  where has_table_privilege('anon', x.t, 'SELECT')
     or has_table_privilege('anon', x.t, 'INSERT')
     or has_table_privilege('anon', x.t, 'UPDATE')
     or has_table_privilege('anon', x.t, 'DELETE')
),
anon_schema as (
  select case when has_schema_privilege('anon', 'public', 'USAGE') then 1 else 0 end as n
),

-- 2. Todas las tablas de datos con RLS activo
sin_rls as (
  select count(*) as n
  from pg_tables t
  join pg_class c on c.relname = t.tablename
  join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = t.schemaname
  where t.schemaname = 'public'
    and t.tablename in (
      'organizaciones','perfiles','configuracion_negocio','secuencias_documento',
      'clientes','servicios','cotizaciones','cotizacion_items',
      'facturas','factura_items','prestamos','cuotas','pagos'
    )
    and c.relrowsecurity = false
),

-- 3. No debe quedar ninguna política permisiva del esquema anterior
politicas_abiertas as (
  select count(*) as n
  from pg_policies
  where schemaname = 'public'
    and (qual = 'true' or with_check = 'true')
),

-- 4. Tablas de datos sin política alguna (RLS activo sin política = nadie entra)
sin_politica as (
  select count(*) as n
  from (
    select unnest(array[
      'clientes','servicios','cotizaciones','cotizacion_items',
      'facturas','factura_items','prestamos','cuotas','pagos',
      'configuracion_negocio','secuencias_documento'
    ]) as tabla
  ) t
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.tabla
  )
),

-- 5. La función de resolución de organización existe y es security definer
funcion_org as (
  select count(*) as n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'org_actual' and p.prosecdef = true
),

-- 6. Ninguna fila puede quedar sin organización
huerfanas as (
  select
    (select count(*) from public.clientes     where organizacion_id is null) +
    (select count(*) from public.servicios    where organizacion_id is null) +
    (select count(*) from public.cotizaciones where organizacion_id is null) +
    (select count(*) from public.facturas     where organizacion_id is null) +
    (select count(*) from public.prestamos    where organizacion_id is null) +
    (select count(*) from public.pagos        where organizacion_id is null) as n
),

-- 7. Numeración sin duplicados dentro de una misma organización
duplicados as (
  select
    coalesce((select count(*) from (
      select organizacion_id, numero from public.cotizaciones
      group by organizacion_id, numero having count(*) > 1
    ) d), 0) +
    coalesce((select count(*) from (
      select organizacion_id, numero from public.facturas
      group by organizacion_id, numero having count(*) > 1
    ) d), 0) as n
),

-- 8. Las secuencias deben ir por delante de lo ya emitido
secuencias as (
  select count(*) as n
  from public.facturas f
  join public.secuencias_documento s
    on s.organizacion_id = f.organizacion_id
   and s.tipo = 'factura'
   and s.anio = nullif(split_part(f.numero, '-', 2), '')::integer
  where f.numero ~ '^FAC-[0-9]{4}-'
    and coalesce(nullif(regexp_replace(split_part(f.numero, '-', 3), '[^0-9]', '', 'g'), '')::integer, 0) > s.ultimo
),

-- 9. Las funciones de negocio deben existir
funciones as (
  select count(*) as n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'crear_organizacion','siguiente_numero_documento','guardar_cotizacion',
      'guardar_factura','registrar_pago_factura','guardar_prestamo',
      'registrar_pago_cuota','actualizar_atrasos','eliminar_cliente',
      'convertir_cotizacion_en_factura','contar_historial_cliente'
    )
),

-- 10. El bucket de logos debe existir
bucket as (
  select count(*) as n from storage.buckets where id = 'logos'
)

select * from (
  select 1 as orden,
         'El rol anonimo no tiene permisos de tabla' as comprobacion,
         (select n from anon_tablas)::text as valor,
         case when (select n from anon_tablas) = 0 then 'OK' else 'FALLO' end as resultado
  union all
  select 2, 'El rol anonimo no tiene USAGE sobre el esquema public',
         (select n from anon_schema)::text,
         case when (select n from anon_schema) = 0 then 'OK' else 'FALLO' end
  union all
  select 3, 'Todas las tablas tienen RLS activo',
         (select n from sin_rls)::text || ' sin RLS',
         case when (select n from sin_rls) = 0 then 'OK' else 'FALLO' end
  union all
  select 4, 'No quedan politicas permisivas (using true)',
         (select n from politicas_abiertas)::text,
         case when (select n from politicas_abiertas) = 0 then 'OK' else 'FALLO' end
  union all
  select 5, 'Todas las tablas de datos tienen politica',
         (select n from sin_politica)::text || ' sin politica',
         case when (select n from sin_politica) = 0 then 'OK' else 'FALLO' end
  union all
  select 6, 'La funcion org_actual existe y es security definer',
         (select n from funcion_org)::text,
         case when (select n from funcion_org) = 1 then 'OK' else 'FALLO' end
  union all
  select 7, 'Ninguna fila sin organizacion asignada',
         (select n from huerfanas)::text || ' huerfanas',
         case when (select n from huerfanas) = 0 then 'OK' else 'FALLO' end
  union all
  select 8, 'Sin numeros de documento duplicados',
         (select n from duplicados)::text,
         case when (select n from duplicados) = 0 then 'OK' else 'FALLO' end
  union all
  select 9, 'Las secuencias van por delante de lo ya emitido',
         (select n from secuencias)::text || ' desfasadas',
         case when (select n from secuencias) = 0 then 'OK' else 'FALLO' end
  union all
  select 10, 'Las 11 funciones de negocio existen',
         (select n from funciones)::text || ' de 11',
         case when (select n from funciones) = 11 then 'OK' else 'FALLO' end
  union all
  select 11, 'El bucket de logos existe',
         (select n from bucket)::text,
         case when (select n from bucket) = 1 then 'OK' else 'FALLO' end
) r
order by orden;
