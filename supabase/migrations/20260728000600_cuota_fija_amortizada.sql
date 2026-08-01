-- =====================================================================
-- Tercera modalidad: cuota fija amortizada (sistema francés)
-- =====================================================================
-- Hasta ahora el interés se cobraba siempre sobre el capital completo, en
-- una sola vez (`fijo_total`) o en cada cuota (`por_periodo`). Falta el
-- modelo que usan los bancos —y los socios del cliente—: la cuota es fija,
-- pero la tasa se aplica al **saldo que queda**, así que el interés baja
-- cuota a cuota mientras el capital se liquida.
--
--     cuota = capital × i / (1 − (1 + i)^−n)
--
-- Con RD$10,000 al 12% quincenal a 4 cuotas: cuota RD$3,292.34, interés
-- total RD$3,169.38 (frente a RD$4,800 en `por_periodo`).
--
-- Además cada cuota guarda ahora su desglose (interés, capital y saldo
-- restante), que antes había que deducir y con la amortización ya no se
-- puede: cada cuota reparte distinto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Desglose por cuota
-- ---------------------------------------------------------------------
alter table public.cuotas
  add column if not exists interes       numeric(14,2) not null default 0,
  add column if not exists capital       numeric(14,2) not null default 0,
  add column if not exists saldo_capital numeric(14,2) not null default 0;

-- Relleno de las cuotas ya existentes. Todas vienen de préstamos sin
-- amortizar, así que el reparto es uniforme: cada cuota abona la misma
-- porción de capital y el resto es interés. La última absorbe el redondeo
-- para que el capital sume exactamente lo prestado y el saldo cierre en
-- cero, igual que hace el cálculo nuevo.
update public.cuotas c
set
  capital = case
              when c.numero = p.num_cuotas
                then round(p.monto_prestado
                           - round(p.monto_prestado / p.num_cuotas, 2) * (p.num_cuotas - 1), 2)
              else round(p.monto_prestado / p.num_cuotas, 2)
            end,
  interes = c.monto - case
              when c.numero = p.num_cuotas
                then round(p.monto_prestado
                           - round(p.monto_prestado / p.num_cuotas, 2) * (p.num_cuotas - 1), 2)
              else round(p.monto_prestado / p.num_cuotas, 2)
            end,
  saldo_capital = case
                    when c.numero = p.num_cuotas then 0
                    else round(p.monto_prestado
                               - round(p.monto_prestado / p.num_cuotas, 2) * c.numero, 2)
                  end
from public.prestamos p
where c.prestamo_id = p.id
  and c.capital = 0
  and c.interes = 0;

-- ---------------------------------------------------------------------
-- 2. Modalidad `amortizado`
-- ---------------------------------------------------------------------
alter table public.prestamos drop constraint if exists chk_prestamos_modalidad;
alter table public.prestamos add  constraint chk_prestamos_modalidad
  check (modalidad_interes in ('por_periodo', 'amortizado', 'fijo_total'));

-- ---------------------------------------------------------------------
-- 3. Cálculo del préstamo y calendario de cuotas
-- ---------------------------------------------------------------------
-- Esta función sigue siendo la única autoridad sobre los números: el
-- cliente sólo reproduce la fórmula para la vista previa
-- (ver src/utils/calculos.ts, que debe mantenerse idéntico).
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
  v_i          numeric;   -- tasa del periodo en tanto por uno
  v_interes    numeric;
  v_total      numeric;
  v_paso       interval;
  v_cuota_fija numeric;   -- sólo en la modalidad amortizada
  v_int_fijo   numeric;   -- interés por cuota cuando no se amortiza
  v_cap_fijo   numeric;   -- capital por cuota cuando no se amortiza
  v_saldo      numeric;
  v_int_acum   numeric := 0;
  v_cuota_int  numeric;
  v_cuota_cap  numeric;
  v_ints       numeric[] := '{}';   -- desglose armado antes de guardarlo
  v_caps       numeric[] := '{}';
  v_sals       numeric[] := '{}';
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
  if v_modalidad not in ('por_periodo', 'amortizado', 'fijo_total') then
    raise exception 'Modalidad de interés inválida: %', v_modalidad;
  end if;

  v_i := v_tasa / 100;

  -- Cuota fija del sistema francés. Con tasa cero degenera en capital/n.
  if v_modalidad = 'amortizado' then
    if v_i <= 0 then
      v_cuota_fija := round(v_monto / v_num, 2);
    else
      v_cuota_fija := round((v_monto * v_i) / (1 - power(1 + v_i, -v_num)), 2);
    end if;
  end if;

  -- Interés y capital por cuota cuando el capital no se amortiza.
  v_int_fijo := case v_modalidad
                  when 'por_periodo' then round(v_monto * v_i, 2)
                  when 'fijo_total'  then round((v_monto * v_i) / v_num, 2)
                  else 0
                end;
  v_cap_fijo := round(v_monto / v_num, 2);

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

  -- El total sólo se conoce al recorrer el calendario, así que el desglose
  -- se arma primero en memoria y se guarda después, ya con los totales.
  v_saldo := v_monto;

  for i in 1..v_num loop
    -- Sobre el saldo vivo al amortizar; sobre el capital completo si no.
    v_cuota_int := case when v_modalidad = 'amortizado'
                        then round(v_saldo * v_i, 2)
                        else v_int_fijo
                   end;

    if i = v_num then
      -- La última cuota cierra el saldo exactamente en cero: nunca queda
      -- un céntimo colgando.
      v_cuota_cap := v_saldo;
      if v_modalidad = 'fijo_total' then
        v_cuota_int := round(v_monto * v_i - v_int_acum, 2);
      end if;
    elsif v_modalidad = 'amortizado' then
      v_cuota_cap := round(v_cuota_fija - v_cuota_int, 2);
    else
      v_cuota_cap := v_cap_fijo;
    end if;

    -- Con tasas muy altas y plazos largos la cuota apenas cubre el
    -- interés; nunca se deja que el capital crezca.
    if v_cuota_cap < 0 then
      v_cuota_cap := 0;
    end if;

    v_int_acum := round(v_int_acum + v_cuota_int, 2);
    v_saldo    := round(v_saldo - v_cuota_cap, 2);

    v_ints := v_ints || v_cuota_int;
    v_caps := v_caps || v_cuota_cap;
    v_sals := v_sals || v_saldo;
  end loop;

  v_interes := round(v_int_acum, 2);
  v_total   := round(v_monto + v_interes, 2);

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

  insert into public.cuotas (
    organizacion_id, prestamo_id, numero, fecha_vencimiento,
    monto, interes, capital, saldo_capital, monto_pagado, estado
  )
  select
    v_org, v_id, n, (v_inicio + (v_paso * n))::date,
    round(v_caps[n] + v_ints[n], 2), v_ints[n], v_caps[n], v_sals[n],
    0, 'pendiente'
  from generate_series(1, v_num) as n
  order by n;

  return public.obtener_prestamo(v_id);
end;
$$;

-- Los permisos se reafirman de forma idempotente: la función sólo debe ser
-- ejecutable por usuarios autenticados, nunca por `anon` ni por `public`.
revoke all on function public.guardar_prestamo(jsonb) from public, anon;
grant execute on function public.guardar_prestamo(jsonb) to authenticated;
