-- =====================================================================
-- El «hoy» del negocio es el de Santo Domingo
-- =====================================================================
-- La base de datos trabaja en UTC, y las funciones que deciden qué día es
-- hoy usaban `current_date`: desde las 8 p. m. en República Dominicana
-- (UTC−4) para el servidor ya era mañana. Una cuota que vencía ese día
-- aparecía atrasada y sumaba un día de mora antes de que el día terminara;
-- la mora habilitada de noche corría desde el día siguiente; una
-- cotización caducaba horas antes, y el 31 de diciembre de noche la
-- numeración de documentos saltaba al año siguiente.
--
-- `hoy_negocio()` da el día de Santo Domingo y reemplaza a `current_date`
-- en esas funciones y en las fechas por defecto de las tablas. Va dentro
-- de cada función —no como una zona horaria fijada aparte— para que quien
-- la edite en el futuro se lleve la corrección con ella. La zona de la
-- base no se toca: las marcas de tiempo siguen guardándose y viajando
-- como instantes absolutos.
--
-- Las definiciones de abajo son las vigentes en producción, con ese único
-- cambio.
-- =====================================================================

create or replace function public.hoy_negocio()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/Santo_Domingo')::date
$$;

revoke all on function public.hoy_negocio() from public, anon;
grant execute on function public.hoy_negocio() to authenticated, service_role;

-- actualizar_atrasos: 2 × current_date → hoy_negocio()
CREATE OR REPLACE FUNCTION public.actualizar_atrasos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid := public.org_actual();
  v_n   integer;
begin
  if v_org is null then
    return 0;
  end if;

  update public.cuotas set estado = 'atrasada'
  where organizacion_id = v_org
    and estado in ('pendiente', 'parcial')
    and fecha_vencimiento < public.hoy_negocio();

  get diagnostics v_n = row_count;

  -- La mora se pone al día en cada arranque de la aplicación, que es
  -- cuando se llama a esta función.
  perform public.acumular_mora();

  update public.prestamos p set estado = case
    when not exists (
      select 1 from public.cuotas c
      where c.prestamo_id = p.id
        and (c.estado <> 'pagada' or c.mora_acumulada > c.mora_pagada)
    ) then 'saldado'
    when exists (select 1 from public.cuotas c
                 where c.prestamo_id = p.id and c.estado = 'atrasada') then 'atrasado'
    else 'activo'
  end
  where p.organizacion_id = v_org;

  -- Vencer cotizaciones cuya validez expiró
  update public.cotizaciones set estado = 'vencida'
  where organizacion_id = v_org
    and estado in ('borrador', 'enviada')
    and fecha + validez_dias < public.hoy_negocio();

  return v_n;
end;
$function$;

-- acumular_mora: 2 × current_date → hoy_negocio()
CREATE OR REPLACE FUNCTION public.acumular_mora(p_prestamo_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid := public.org_actual();
begin
  if v_org is null then
    return;
  end if;

  with candidatas as (
    select
      c.id,
      c.mora_pagada,
      p.mora_modo,
      round(
        p.mora_diaria
        * greatest(
            0,
            public.hoy_negocio() - case
              -- Retroactiva: desde el vencimiento, alcanzando lo ya atrasado.
              when p.mora_retroactiva then c.fecha_vencimiento
              -- Normal: desde que se habilitó, nunca hacia atrás.
              else greatest(c.fecha_vencimiento, p.mora_desde)
            end
          ),
        2
      ) as mora,
      row_number() over (partition by p.id order by c.fecha_vencimiento, c.numero) as orden
    from public.cuotas c
    join public.prestamos p on p.id = c.prestamo_id
    where c.organizacion_id = v_org
      and p.mora_activa
      and p.mora_desde is not null
      and c.estado <> 'pagada'
      and c.fecha_vencimiento < public.hoy_negocio()
      and (p_prestamo_id is null or p.id = p_prestamo_id)
  )
  update public.cuotas c
  set mora_acumulada = case
        when cand.mora_modo = 'por_cuota' or cand.orden = 1 then cand.mora
        -- Con una sola mora para todo el préstamo, las demás cuotas
        -- vencidas no acumulan; se conserva lo ya cobrado, que es historia.
        else cand.mora_pagada
      end
  from candidatas cand
  where c.id = cand.id
    and c.mora_acumulada is distinct from (
      case
        when cand.mora_modo = 'por_cuota' or cand.orden = 1 then cand.mora
        else cand.mora_pagada
      end
    );
end;
$function$;

-- configurar_mora: 1 × current_date → hoy_negocio()
CREATE OR REPLACE FUNCTION public.configurar_mora(p_prestamo_id uuid, p_activa boolean, p_diaria numeric, p_modo text, p_retroactiva boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org   uuid := public.org_actual();
  v_desde date;
  v_existe boolean;
begin
  if v_org is null then
    raise exception 'Usuario sin organización asignada';
  end if;
  if p_modo not in ('por_cuota', 'por_prestamo') then
    raise exception 'Modo de mora inválido: %', p_modo;
  end if;
  if p_activa and (p_diaria is null or p_diaria <= 0) then
    raise exception 'La mora diaria debe ser mayor que cero';
  end if;
  if coalesce(p_diaria, 0) > 999999 then
    raise exception 'La mora diaria supera el máximo permitido';
  end if;

  select true, mora_desde into v_existe, v_desde
  from public.prestamos
  where id = p_prestamo_id and organizacion_id = v_org;

  if not coalesce(v_existe, false) then
    raise exception 'Préstamo no encontrado';
  end if;

  update public.prestamos set
    mora_activa      = p_activa,
    mora_diaria      = case when p_activa then round(coalesce(p_diaria, 0), 2) else mora_diaria end,
    mora_modo        = p_modo,
    mora_retroactiva = coalesce(p_retroactiva, false),
    -- Al habilitarla se guarda el día; si ya estaba activa se conserva el
    -- original para no reiniciar lo que el cliente venía acumulando.
    mora_desde       = case when p_activa then coalesce(v_desde, public.hoy_negocio()) else null end
  where id = p_prestamo_id and organizacion_id = v_org;

  -- Al quitarla se perdona lo que quedaba pendiente de cobrar. Lo ya
  -- cobrado no se toca: eso es dinero que el cliente entregó.
  if not p_activa then
    update public.cuotas set mora_acumulada = mora_pagada
    where prestamo_id = p_prestamo_id and organizacion_id = v_org;
  end if;

  perform public.acumular_mora(p_prestamo_id);
  perform public.recalcular_estado_prestamo(p_prestamo_id);

  return public.obtener_prestamo(p_prestamo_id);
end;
$function$;

-- guardar_cotizacion: 1 × current_date → hoy_negocio()
CREATE OR REPLACE FUNCTION public.guardar_cotizacion(p_datos jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org    uuid := public.org_actual();
  v_id     uuid := nullif(p_datos->>'id', '')::uuid;
  v_tasa   numeric;
  v_totales record;
  v_numero text;
begin
  if v_org is null then
    raise exception 'Usuario sin organización asignada';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'La cotización debe tener al menos una línea';
  end if;
  if not exists (select 1 from public.clientes
                 where id = (p_datos->>'cliente_id')::uuid and organizacion_id = v_org) then
    raise exception 'El cliente indicado no existe en esta organización';
  end if;

  select itbis_rate into v_tasa from public.configuracion_negocio where organizacion_id = v_org;
  v_tasa := coalesce(v_tasa, 18);

  select * into v_totales
  from public.calcular_totales(p_items, coalesce((p_datos->>'aplica_itbis')::boolean, true), v_tasa);

  if v_id is null then
    v_numero := public.siguiente_numero_documento('cotizacion');

    insert into public.cotizaciones (
      organizacion_id, user_id, cliente_id, numero, fecha, validez_dias,
      estado, subtotal, aplica_itbis, itbis, total, notas
    ) values (
      v_org, auth.uid(), (p_datos->>'cliente_id')::uuid, v_numero,
      coalesce((p_datos->>'fecha')::date, public.hoy_negocio()),
      coalesce((p_datos->>'validez_dias')::integer, 15),
      coalesce(p_datos->>'estado', 'borrador'),
      v_totales.subtotal, coalesce((p_datos->>'aplica_itbis')::boolean, true),
      v_totales.itbis, v_totales.total, p_datos->>'notas'
    ) returning id into v_id;
  else
    update public.cotizaciones set
      cliente_id   = (p_datos->>'cliente_id')::uuid,
      fecha        = coalesce((p_datos->>'fecha')::date, fecha),
      validez_dias = coalesce((p_datos->>'validez_dias')::integer, validez_dias),
      estado       = coalesce(p_datos->>'estado', estado),
      subtotal     = v_totales.subtotal,
      aplica_itbis = coalesce((p_datos->>'aplica_itbis')::boolean, aplica_itbis),
      itbis        = v_totales.itbis,
      total        = v_totales.total,
      notas        = p_datos->>'notas'
    where id = v_id and organizacion_id = v_org;

    if not found then
      raise exception 'Cotización no encontrada';
    end if;

    delete from public.cotizacion_items where cotizacion_id = v_id;
  end if;

  insert into public.cotizacion_items (
    organizacion_id, cotizacion_id, servicio_id, descripcion, cantidad, precio_unitario, importe
  )
  select
    v_org, v_id, nullif(it->>'servicio_id', '')::uuid,
    trim(it->>'descripcion'),
    (it->>'cantidad')::numeric,
    (it->>'precio_unitario')::numeric,
    round((it->>'cantidad')::numeric * (it->>'precio_unitario')::numeric, 2)
  from jsonb_array_elements(p_items) it;

  return public.obtener_cotizacion(v_id);
end;
$function$;

-- guardar_factura: 1 × current_date → hoy_negocio()
CREATE OR REPLACE FUNCTION public.guardar_factura(p_datos jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org      uuid := public.org_actual();
  v_id       uuid := nullif(p_datos->>'id', '')::uuid;
  v_tasa     numeric;
  v_totales  record;
  v_numero   text;
  v_pagado   numeric := 0;
  v_ncf      text;
begin
  if v_org is null then
    raise exception 'Usuario sin organización asignada';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'La factura debe tener al menos una línea';
  end if;
  if not exists (select 1 from public.clientes
                 where id = (p_datos->>'cliente_id')::uuid and organizacion_id = v_org) then
    raise exception 'El cliente indicado no existe en esta organización';
  end if;

  v_ncf := nullif(upper(trim(coalesce(p_datos->>'ncf', ''))), '');
  if v_ncf is not null and v_ncf !~ '^[BEbe][0-9]{10}$' then
    raise exception 'El NCF debe tener el formato B seguido de 10 dígitos (ej. B0100000123)';
  end if;

  select itbis_rate into v_tasa from public.configuracion_negocio where organizacion_id = v_org;
  v_tasa := coalesce(v_tasa, 18);

  select * into v_totales
  from public.calcular_totales(p_items, coalesce((p_datos->>'aplica_itbis')::boolean, true), v_tasa);

  if v_id is null then
    v_numero := public.siguiente_numero_documento('factura');

    insert into public.facturas (
      organizacion_id, user_id, cliente_id, cotizacion_id, numero, ncf, fecha,
      estado, subtotal, aplica_itbis, itbis, total, monto_pagado, saldo_pendiente, notas
    ) values (
      v_org, auth.uid(), (p_datos->>'cliente_id')::uuid,
      nullif(p_datos->>'cotizacion_id', '')::uuid, v_numero, v_ncf,
      coalesce((p_datos->>'fecha')::date, public.hoy_negocio()),
      'pendiente', v_totales.subtotal, coalesce((p_datos->>'aplica_itbis')::boolean, true),
      v_totales.itbis, v_totales.total, 0, v_totales.total, p_datos->>'notas'
    ) returning id into v_id;
  else
    select monto_pagado into v_pagado from public.facturas
    where id = v_id and organizacion_id = v_org;

    if v_pagado is null then
      raise exception 'Factura no encontrada';
    end if;

    -- Una factura no puede reducirse por debajo de lo ya cobrado
    if v_totales.total < v_pagado then
      raise exception 'El nuevo total (%) es menor que el monto ya pagado (%)',
        v_totales.total, v_pagado;
    end if;

    update public.facturas set
      cliente_id      = (p_datos->>'cliente_id')::uuid,
      ncf             = v_ncf,
      fecha           = coalesce((p_datos->>'fecha')::date, fecha),
      subtotal        = v_totales.subtotal,
      aplica_itbis    = coalesce((p_datos->>'aplica_itbis')::boolean, aplica_itbis),
      itbis           = v_totales.itbis,
      total           = v_totales.total,
      saldo_pendiente = round(v_totales.total - v_pagado, 2),
      estado          = case
                          when round(v_totales.total - v_pagado, 2) <= 0 then 'pagada'
                          when v_pagado > 0 then 'parcial'
                          else 'pendiente'
                        end,
      notas           = p_datos->>'notas'
    where id = v_id and organizacion_id = v_org;

    delete from public.factura_items where factura_id = v_id;
  end if;

  insert into public.factura_items (
    organizacion_id, factura_id, servicio_id, descripcion, cantidad, precio_unitario, importe
  )
  select
    v_org, v_id, nullif(it->>'servicio_id', '')::uuid,
    trim(it->>'descripcion'),
    (it->>'cantidad')::numeric,
    (it->>'precio_unitario')::numeric,
    round((it->>'cantidad')::numeric * (it->>'precio_unitario')::numeric, 2)
  from jsonb_array_elements(p_items) it;

  return public.obtener_factura(v_id);
end;
$function$;

-- guardar_prestamo: 1 × current_date → hoy_negocio()
CREATE OR REPLACE FUNCTION public.guardar_prestamo(p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org        uuid := public.org_actual();
  v_id         uuid := nullif(p_datos->>'id', '')::uuid;
  v_monto      numeric := round((p_datos->>'monto_prestado')::numeric, 2);
  v_tasa       numeric := (p_datos->>'tasa_interes')::numeric;
  v_num        integer := (p_datos->>'num_cuotas')::integer;
  v_frecuencia text    := coalesce(p_datos->>'frecuencia', 'mensual');
  v_modalidad  text    := coalesce(p_datos->>'modalidad_interes', 'por_periodo');
  v_inicio     date    := coalesce((p_datos->>'fecha_inicio')::date, public.hoy_negocio());
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

  -- Marcar atrasos y poner el estado al día antes de devolverlo. Sin esto,
  -- un préstamo registrado con fechas ya pasadas —lo normal al meter en el
  -- sistema uno que venía de antes— aparecía «al día» hasta la siguiente
  -- recarga de la aplicación, y su mora no empezaba a contar.
  perform public.recalcular_estado_prestamo(v_id);

  return public.obtener_prestamo(v_id);
end;
$function$;

-- recalcular_estado_prestamo: 1 × current_date → hoy_negocio()
CREATE OR REPLACE FUNCTION public.recalcular_estado_prestamo(p_prestamo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Marcar como atrasadas las cuotas vencidas que no están saldadas
  update public.cuotas set estado = 'atrasada'
  where prestamo_id = p_prestamo_id
    and estado in ('pendiente', 'parcial')
    and fecha_vencimiento < public.hoy_negocio();

  perform public.acumular_mora(p_prestamo_id);

  update public.prestamos p set estado = case
    -- Saldado sólo cuando no queda ni cuota ni mora por cobrar
    when not exists (
      select 1 from public.cuotas c
      where c.prestamo_id = p.id
        and (c.estado <> 'pagada' or c.mora_acumulada > c.mora_pagada)
    ) then 'saldado'
    when exists (select 1 from public.cuotas c
                 where c.prestamo_id = p.id and c.estado = 'atrasada') then 'atrasado'
    else 'activo'
  end
  where p.id = p_prestamo_id;
end;
$function$;

-- registrar_pago_cuota: 1 × current_date → hoy_negocio()
CREATE OR REPLACE FUNCTION public.registrar_pago_cuota(p_cuota_id uuid, p_monto numeric, p_metodo text, p_referencia text DEFAULT NULL::text, p_monto_mora numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org         uuid := public.org_actual();
  v_cuota       public.cuotas;
  v_total       numeric := round(coalesce(p_monto, 0), 2);
  v_mora        numeric := round(coalesce(p_monto_mora, 0), 2);
  v_a_cuota     numeric;
  v_mora_pend   numeric;
  v_restante    numeric;
  v_nuevo       numeric;
  v_prestamo    uuid;
begin
  select * into v_cuota from public.cuotas
  where id = p_cuota_id and organizacion_id = v_org
  for update;

  if not found then
    raise exception 'Cuota no encontrada';
  end if;

  v_prestamo := v_cuota.prestamo_id;

  -- Poner la mora al día ANTES de cobrar: el reparto tiene que hacerse
  -- sobre la cifra de hoy, no sobre la de la última vez que se abrió la
  -- aplicación.
  perform public.acumular_mora(v_prestamo);
  select * into v_cuota from public.cuotas where id = p_cuota_id;

  v_mora_pend := round(greatest(0, v_cuota.mora_acumulada - v_cuota.mora_pagada), 2);
  v_restante  := round(v_cuota.monto - v_cuota.monto_pagado, 2);
  v_a_cuota   := round(v_total - v_mora, 2);

  if v_total <= 0 then
    raise exception 'El monto del abono debe ser mayor que cero';
  end if;
  if v_mora < 0 then
    raise exception 'La parte de mora no puede ser negativa';
  end if;
  if v_mora > v_mora_pend then
    raise exception 'La parte de mora (%) supera la mora pendiente (%)', v_mora, v_mora_pend;
  end if;
  if v_a_cuota < 0 then
    raise exception 'La parte de mora no puede superar el total entregado';
  end if;
  if v_a_cuota > v_restante then
    raise exception 'El abono a la cuota (%) supera lo que resta de la cuota (%)', v_a_cuota, v_restante;
  end if;

  v_nuevo := round(v_cuota.monto_pagado + v_a_cuota, 2);

  insert into public.pagos (
    organizacion_id, prestamo_id, cuota_id, monto, monto_mora, fecha, metodo, referencia
  ) values (
    v_org, v_prestamo, p_cuota_id, v_total, v_mora, now(),
    coalesce(p_metodo, 'efectivo'), nullif(trim(coalesce(p_referencia, '')), '')
  );

  update public.cuotas set
    monto_pagado = v_nuevo,
    mora_pagada  = round(mora_pagada + v_mora, 2),
    estado       = case
                     when v_nuevo >= monto then 'pagada'
                     when v_nuevo > 0 then 'parcial'
                     when fecha_vencimiento < public.hoy_negocio() then 'atrasada'
                     else 'pendiente'
                   end
  where id = p_cuota_id;

  perform public.recalcular_estado_prestamo(v_prestamo);

  return public.obtener_prestamo(v_prestamo);
end;
$function$;

-- siguiente_numero_documento: 1 × current_date → hoy_negocio()
CREATE OR REPLACE FUNCTION public.siguiente_numero_documento(p_tipo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org     uuid := public.org_actual();
  v_anio    integer := extract(year from public.hoy_negocio())::integer;
  v_ultimo  integer;
  v_prefijo text;
begin
  if v_org is null then
    raise exception 'Usuario sin organización asignada';
  end if;
  if p_tipo not in ('cotizacion', 'factura') then
    raise exception 'Tipo de documento inválido: %', p_tipo;
  end if;

  -- `on conflict do update` serializa a los usuarios concurrentes de la
  -- misma organización: dos facturas simultáneas nunca reciben el mismo
  -- número, y borrar un documento no libera el correlativo.
  insert into public.secuencias_documento (organizacion_id, tipo, anio, ultimo)
  values (v_org, p_tipo, v_anio, 1)
  on conflict (organizacion_id, tipo, anio)
  do update set ultimo = public.secuencias_documento.ultimo + 1
  returning ultimo into v_ultimo;

  v_prefijo := case when p_tipo = 'cotizacion' then 'COT' else 'FAC' end;
  return v_prefijo || '-' || v_anio || '-' || lpad(v_ultimo::text, 4, '0');
end;
$function$;

-- Las fechas por defecto de las tablas, por si algo inserta sin darlas
alter table public.cotizaciones alter column fecha        set default public.hoy_negocio();
alter table public.facturas     alter column fecha        set default public.hoy_negocio();
alter table public.prestamos    alter column fecha_inicio set default public.hoy_negocio();
