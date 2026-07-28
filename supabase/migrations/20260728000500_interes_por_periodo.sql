-- =====================================================================
-- Interés por periodo y nuevas frecuencias de préstamo
-- =====================================================================
-- Hasta ahora la tasa de interés se cobraba una sola vez sobre el capital
-- («10%» eran 10%, dieran 4 cuotas quincenales o 24 mensuales), así que la
-- frecuencia sólo movía las fechas de vencimiento y decir «interés
-- quincenal» no significaba nada.
--
-- A partir de aquí el préstamo declara CÓMO se cobra su interés:
--
--   · por_periodo  la tasa se cobra en cada cuota. 10% quincenal a 4 cuotas
--                  quincenales = 40% de interés sobre el capital.
--   · fijo_total   la tasa se cobra una sola vez, sin importar el plazo.
--                  Es el comportamiento anterior.
--
-- Los préstamos que ya existen quedan marcados como `fijo_total`: sus
-- números no cambian. Los nuevos usan `por_periodo`, que es el modelo de
-- cobro habitual en República Dominicana.
--
-- Además se admiten frecuencias diaria, bimestral, trimestral, semestral y
-- anual, y los periodos de un mes o más avanzan por calendario (el 31 de
-- enero vence el 28 de febrero) en vez de por bloques de 30 días.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Modalidad de interés
-- ---------------------------------------------------------------------
-- El `default 'fijo_total'` rellena las filas existentes con el criterio
-- con el que fueron calculadas; después se cambia el default para que los
-- préstamos nuevos nazcan con el modelo por periodo.
alter table public.prestamos
  add column if not exists modalidad_interes text not null default 'fijo_total';

alter table public.prestamos
  alter column modalidad_interes set default 'por_periodo';

alter table public.prestamos drop constraint if exists chk_prestamos_modalidad;
alter table public.prestamos add  constraint chk_prestamos_modalidad
  check (modalidad_interes in ('por_periodo', 'fijo_total'));

-- ---------------------------------------------------------------------
-- 2. Frecuencias admitidas
-- ---------------------------------------------------------------------
update public.prestamos set frecuencia = 'mensual'
where frecuencia is null
   or frecuencia not in ('diario', 'semanal', 'quincenal', 'mensual',
                         'bimestral', 'trimestral', 'semestral', 'anual');

alter table public.prestamos alter column frecuencia set not null;

alter table public.prestamos drop constraint if exists chk_prestamos_frecuencia;
alter table public.prestamos add  constraint chk_prestamos_frecuencia
  check (frecuencia in ('diario', 'semanal', 'quincenal', 'mensual',
                        'bimestral', 'trimestral', 'semestral', 'anual'));

-- ---------------------------------------------------------------------
-- 3. Cálculo del préstamo y calendario de cuotas
-- ---------------------------------------------------------------------
-- Esta función es la única autoridad sobre los números: el cliente sólo
-- reproduce la fórmula para la vista previa (ver src/utils/calculos.ts).
create or replace function public.guardar_prestamo(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org        uuid := public.org_actual();
  v_id         uuid := nullif(p_datos->>'id', '')::uuid;
  v_monto      numeric := round((p_datos->>'monto_prestado')::numeric, 2);
  v_tasa       numeric := (p_datos->>'tasa_interes')::numeric;
  v_num        integer := (p_datos->>'num_cuotas')::integer;
  v_frecuencia text    := coalesce(p_datos->>'frecuencia', 'mensual');
  v_modalidad  text    := coalesce(p_datos->>'modalidad_interes', 'por_periodo');
  v_inicio     date    := coalesce((p_datos->>'fecha_inicio')::date, current_date);
  v_interes    numeric;
  v_total      numeric;
  v_base       numeric;
  v_paso       interval;
  v_acumulado  numeric := 0;
  v_cuota      numeric;
  i            integer;
begin
  if v_org is null then
    raise exception 'Usuario sin organización asignada';
  end if;
  if not exists (select 1 from public.clientes
                 where id = (p_datos->>'cliente_id')::uuid and organizacion_id = v_org) then
    raise exception 'El cliente indicado no existe en esta organización';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto prestado debe ser mayor que cero';
  end if;
  if v_tasa is null or v_tasa < 0 or v_tasa > 100 then
    raise exception 'La tasa de interés debe estar entre 0 y 100';
  end if;
  if v_num is null or v_num < 1 or v_num > 120 then
    raise exception 'El número de cuotas debe estar entre 1 y 120';
  end if;
  if v_frecuencia not in ('diario', 'semanal', 'quincenal', 'mensual',
                          'bimestral', 'trimestral', 'semestral', 'anual') then
    raise exception 'Frecuencia inválida: %', v_frecuencia;
  end if;
  if v_modalidad not in ('por_periodo', 'fijo_total') then
    raise exception 'Modalidad de interés inválida: %', v_modalidad;
  end if;

  -- Interés simple sobre el capital: nunca se amortiza. Con `por_periodo`
  -- se cobra una vez por cuota; con `fijo_total`, una sola vez en total.
  v_interes := case v_modalidad
                 when 'por_periodo' then round(v_monto * (v_tasa / 100) * v_num, 2)
                 else round(v_monto * (v_tasa / 100), 2)
               end;
  v_total   := round(v_monto + v_interes, 2);
  v_base    := round(v_total / v_num, 2);

  -- Los periodos de un mes o más avanzan por calendario: `interval` ajusta
  -- solo el día que no existe (31 de enero + 1 mes = 28 de febrero).
  v_paso := case v_frecuencia
              when 'diario'     then interval '1 day'
              when 'semanal'    then interval '7 days'
              when 'quincenal'  then interval '15 days'
              when 'mensual'    then interval '1 month'
              when 'bimestral'  then interval '2 months'
              when 'trimestral' then interval '3 months'
              when 'semestral'  then interval '6 months'
              else                   interval '1 year'
            end;

  if v_id is null then
    insert into public.prestamos (
      organizacion_id, user_id, cliente_id, monto_prestado, tasa_interes,
      modalidad_interes, interes_total, total_a_pagar, num_cuotas, frecuencia,
      fecha_inicio, estado
    ) values (
      v_org, auth.uid(), (p_datos->>'cliente_id')::uuid, v_monto, v_tasa,
      v_modalidad, v_interes, v_total, v_num, v_frecuencia,
      v_inicio, 'activo'
    ) returning id into v_id;
  else
    if exists (select 1 from public.cuotas where prestamo_id = v_id and monto_pagado > 0) then
      raise exception 'No se puede modificar un préstamo que ya tiene pagos registrados';
    end if;

    update public.prestamos set
      cliente_id        = (p_datos->>'cliente_id')::uuid,
      monto_prestado    = v_monto,
      tasa_interes      = v_tasa,
      modalidad_interes = v_modalidad,
      interes_total     = v_interes,
      total_a_pagar     = v_total,
      num_cuotas        = v_num,
      frecuencia        = v_frecuencia,
      fecha_inicio      = v_inicio
    where id = v_id and organizacion_id = v_org;

    if not found then
      raise exception 'Préstamo no encontrado';
    end if;

    delete from public.cuotas where prestamo_id = v_id;
  end if;

  -- La última cuota absorbe el redondeo para que la suma cuadre exactamente
  for i in 1..v_num loop
    if i = v_num then
      v_cuota := round(v_total - v_acumulado, 2);
    else
      v_cuota := v_base;
      v_acumulado := round(v_acumulado + v_base, 2);
    end if;

    insert into public.cuotas (organizacion_id, prestamo_id, numero, fecha_vencimiento, monto, monto_pagado, estado)
    values (v_org, v_id, i, (v_inicio + (v_paso * i))::date, v_cuota, 0, 'pendiente');
  end loop;

  return public.obtener_prestamo(v_id);
end;
$$;

-- Los permisos se reafirman de forma idempotente: la función sólo debe ser
-- ejecutable por usuarios autenticados, nunca por `anon` ni por `public`.
revoke all on function public.guardar_prestamo(jsonb) from public, anon;
grant execute on function public.guardar_prestamo(jsonb) to authenticated;
