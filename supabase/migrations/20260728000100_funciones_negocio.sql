-- =====================================================================
-- Funciones de negocio (RPC)
-- =====================================================================
-- El cliente no vuelve a escribir documentos y líneas por separado: cada
-- operación de dinero ocurre dentro de una única transacción en el
-- servidor, que además valida las reglas (sobrepagos, numeración
-- correlativa, coherencia de totales).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Alta de organización — se llama justo después del registro
-- ---------------------------------------------------------------------
create or replace function public.crear_organizacion(p_nombre text, p_rnc text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_rnc text;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión activa';
  end if;

  if exists (select 1 from public.perfiles where id = auth.uid()) then
    raise exception 'Este usuario ya pertenece a una organización';
  end if;

  if p_nombre is null or length(trim(p_nombre)) = 0 then
    raise exception 'El nombre del negocio es obligatorio';
  end if;

  v_rnc := nullif(regexp_replace(coalesce(p_rnc, ''), '[^0-9]', '', 'g'), '');
  if v_rnc is not null and v_rnc !~ '^[0-9]{9,11}$' then
    raise exception 'El RNC o cédula debe tener 9 u 11 dígitos';
  end if;

  insert into public.organizaciones (nombre, rnc)
  values (trim(p_nombre), v_rnc)
  returning id into v_org;

  insert into public.perfiles (id, organizacion_id, nombre, rol)
  values (auth.uid(), v_org, trim(p_nombre), 'propietario');

  insert into public.configuracion_negocio (organizacion_id, business_name, documento)
  values (v_org, trim(p_nombre), v_rnc);

  return v_org;
end;
$$;

-- ---------------------------------------------------------------------
-- Numeración correlativa atómica
-- ---------------------------------------------------------------------
create or replace function public.siguiente_numero_documento(p_tipo text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org     uuid := public.org_actual();
  v_anio    integer := extract(year from current_date)::integer;
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
$$;

-- ---------------------------------------------------------------------
-- Recalcular totales a partir de las líneas (fuente de verdad: servidor)
-- ---------------------------------------------------------------------
create or replace function public.calcular_totales(
  p_items       jsonb,
  p_aplica_itbis boolean,
  p_tasa_itbis  numeric,
  out subtotal  numeric,
  out itbis     numeric,
  out total     numeric
)
language plpgsql
immutable
as $$
begin
  select coalesce(sum(round((it->>'cantidad')::numeric * (it->>'precio_unitario')::numeric, 2)), 0)
  into subtotal
  from jsonb_array_elements(p_items) it;

  itbis := case when p_aplica_itbis then round(subtotal * (p_tasa_itbis / 100), 2) else 0 end;
  total := round(subtotal + itbis, 2);
end;
$$;

-- ---------------------------------------------------------------------
-- Guardar cotización con sus líneas (alta y edición)
-- ---------------------------------------------------------------------
create or replace function public.guardar_cotizacion(p_datos jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
      coalesce((p_datos->>'fecha')::date, current_date),
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
$$;

create or replace function public.obtener_cotizacion(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(c) || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.descripcion)
      from public.cotizacion_items i where i.cotizacion_id = c.id
    ), '[]'::jsonb)
  )
  from public.cotizaciones c
  where c.id = p_id and c.organizacion_id = public.org_actual();
$$;

-- ---------------------------------------------------------------------
-- Guardar factura con sus líneas (alta y edición)
-- ---------------------------------------------------------------------
create or replace function public.guardar_factura(p_datos jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
      coalesce((p_datos->>'fecha')::date, current_date),
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
$$;

create or replace function public.obtener_factura(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(f) || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.descripcion)
      from public.factura_items i where i.factura_id = f.id
    ), '[]'::jsonb),
    'pagos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.fecha)
      from public.pagos p where p.factura_id = f.id
    ), '[]'::jsonb)
  )
  from public.facturas f
  where f.id = p_id and f.organizacion_id = public.org_actual();
$$;

-- ---------------------------------------------------------------------
-- Convertir cotización en factura
-- ---------------------------------------------------------------------
create or replace function public.convertir_cotizacion_en_factura(p_cotizacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := public.org_actual();
  v_cot   public.cotizaciones;
  v_items jsonb;
begin
  select * into v_cot from public.cotizaciones
  where id = p_cotizacion_id and organizacion_id = v_org;

  if not found then
    raise exception 'Cotización no encontrada';
  end if;

  if exists (select 1 from public.facturas where cotizacion_id = p_cotizacion_id) then
    raise exception 'Esta cotización ya fue convertida en factura';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'servicio_id', i.servicio_id, 'descripcion', i.descripcion,
    'cantidad', i.cantidad, 'precio_unitario', i.precio_unitario
  )), '[]'::jsonb)
  into v_items
  from public.cotizacion_items i where i.cotizacion_id = p_cotizacion_id;

  update public.cotizaciones set estado = 'aceptada' where id = p_cotizacion_id;

  return public.guardar_factura(
    jsonb_build_object(
      'cliente_id',    v_cot.cliente_id,
      'cotizacion_id', v_cot.id,
      'aplica_itbis',  v_cot.aplica_itbis,
      'notas',         'Convertida desde ' || v_cot.numero || '. ' || coalesce(v_cot.notas, '')
    ),
    v_items
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Registrar pago de factura
-- ---------------------------------------------------------------------
create or replace function public.registrar_pago_factura(
  p_factura_id uuid,
  p_monto      numeric,
  p_metodo     text,
  p_referencia text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := public.org_actual();
  v_fac    public.facturas;
  v_monto  numeric := round(p_monto, 2);
  v_pagado numeric;
  v_saldo  numeric;
begin
  select * into v_fac from public.facturas
  where id = p_factura_id and organizacion_id = v_org
  for update;

  if not found then
    raise exception 'Factura no encontrada';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto del pago debe ser mayor que cero';
  end if;
  -- El sobrepago ya no se recorta en silencio: se rechaza.
  if v_monto > v_fac.saldo_pendiente then
    raise exception 'El monto (%) supera el saldo pendiente de la factura (%)',
      v_monto, v_fac.saldo_pendiente;
  end if;

  insert into public.pagos (organizacion_id, factura_id, monto, fecha, metodo, referencia)
  values (v_org, p_factura_id, v_monto, now(), coalesce(p_metodo, 'efectivo'), nullif(trim(coalesce(p_referencia, '')), ''));

  v_pagado := round(v_fac.monto_pagado + v_monto, 2);
  v_saldo  := round(v_fac.total - v_pagado, 2);

  update public.facturas set
    monto_pagado    = v_pagado,
    saldo_pendiente = v_saldo,
    estado          = case when v_saldo <= 0 then 'pagada'
                           when v_pagado > 0 then 'parcial'
                           else 'pendiente' end
  where id = p_factura_id;

  return public.obtener_factura(p_factura_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Guardar préstamo con su calendario de cuotas
-- ---------------------------------------------------------------------
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
  v_inicio     date    := coalesce((p_datos->>'fecha_inicio')::date, current_date);
  v_interes    numeric;
  v_total      numeric;
  v_base       numeric;
  v_dias       integer;
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
  if v_monto <= 0 then
    raise exception 'El monto prestado debe ser mayor que cero';
  end if;
  if v_tasa < 0 or v_tasa > 100 then
    raise exception 'La tasa de interés debe estar entre 0 y 100';
  end if;
  if v_num < 1 or v_num > 120 then
    raise exception 'El número de cuotas debe estar entre 1 y 120';
  end if;
  if v_frecuencia not in ('semanal', 'quincenal', 'mensual') then
    raise exception 'Frecuencia inválida: %', v_frecuencia;
  end if;

  -- Interés fijo sobre el capital (no amortizado). Es el modelo de cobro
  -- habitual del préstamo informal dominicano y así se rotula en la interfaz.
  v_interes := round(v_monto * (v_tasa / 100), 2);
  v_total   := round(v_monto + v_interes, 2);
  v_base    := round(v_total / v_num, 2);
  v_dias    := case v_frecuencia when 'semanal' then 7 when 'quincenal' then 15 else 30 end;

  if v_id is null then
    insert into public.prestamos (
      organizacion_id, user_id, cliente_id, monto_prestado, tasa_interes,
      interes_total, total_a_pagar, num_cuotas, frecuencia, fecha_inicio, estado
    ) values (
      v_org, auth.uid(), (p_datos->>'cliente_id')::uuid, v_monto, v_tasa,
      v_interes, v_total, v_num, v_frecuencia, v_inicio, 'activo'
    ) returning id into v_id;
  else
    if exists (select 1 from public.cuotas where prestamo_id = v_id and monto_pagado > 0) then
      raise exception 'No se puede modificar un préstamo que ya tiene pagos registrados';
    end if;

    update public.prestamos set
      cliente_id     = (p_datos->>'cliente_id')::uuid,
      monto_prestado = v_monto,
      tasa_interes   = v_tasa,
      interes_total  = v_interes,
      total_a_pagar  = v_total,
      num_cuotas     = v_num,
      frecuencia     = v_frecuencia,
      fecha_inicio   = v_inicio
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
    values (v_org, v_id, i, v_inicio + (v_dias * i), v_cuota, 0, 'pendiente');
  end loop;

  return public.obtener_prestamo(v_id);
end;
$$;

create or replace function public.obtener_prestamo(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(pr) || jsonb_build_object(
    'cuotas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.numero)
      from public.cuotas c where c.prestamo_id = pr.id
    ), '[]'::jsonb),
    'pagos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.fecha)
      from public.pagos p where p.prestamo_id = pr.id
    ), '[]'::jsonb)
  )
  from public.prestamos pr
  where pr.id = p_id and pr.organizacion_id = public.org_actual();
$$;

-- ---------------------------------------------------------------------
-- Registrar pago de cuota (admite abonos parciales)
-- ---------------------------------------------------------------------
create or replace function public.registrar_pago_cuota(
  p_cuota_id   uuid,
  p_monto      numeric,
  p_metodo     text,
  p_referencia text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org        uuid := public.org_actual();
  v_cuota      public.cuotas;
  v_monto      numeric := round(p_monto, 2);
  v_restante   numeric;
  v_nuevo      numeric;
  v_prestamo   uuid;
begin
  select * into v_cuota from public.cuotas
  where id = p_cuota_id and organizacion_id = v_org
  for update;

  if not found then
    raise exception 'Cuota no encontrada';
  end if;

  v_restante := round(v_cuota.monto - v_cuota.monto_pagado, 2);

  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto del abono debe ser mayor que cero';
  end if;
  if v_monto > v_restante then
    raise exception 'El abono (%) supera lo que resta de la cuota (%)', v_monto, v_restante;
  end if;

  v_prestamo := v_cuota.prestamo_id;
  v_nuevo := round(v_cuota.monto_pagado + v_monto, 2);

  insert into public.pagos (organizacion_id, prestamo_id, cuota_id, monto, fecha, metodo, referencia)
  values (v_org, v_prestamo, p_cuota_id, v_monto, now(), coalesce(p_metodo, 'efectivo'), nullif(trim(coalesce(p_referencia, '')), ''));

  update public.cuotas set
    monto_pagado = v_nuevo,
    estado       = case
                     when v_nuevo >= monto then 'pagada'
                     when v_nuevo > 0 then 'parcial'
                     when fecha_vencimiento < current_date then 'atrasada'
                     else 'pendiente'
                   end
  where id = p_cuota_id;

  perform public.recalcular_estado_prestamo(v_prestamo);

  return public.obtener_prestamo(v_prestamo);
end;
$$;

-- ---------------------------------------------------------------------
-- Estado del préstamo y detección de atrasos
-- ---------------------------------------------------------------------
create or replace function public.recalcular_estado_prestamo(p_prestamo_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Marcar como atrasadas las cuotas vencidas que no están saldadas
  update public.cuotas set estado = 'atrasada'
  where prestamo_id = p_prestamo_id
    and estado in ('pendiente', 'parcial')
    and fecha_vencimiento < current_date;

  update public.prestamos p set estado = case
    when not exists (select 1 from public.cuotas c
                     where c.prestamo_id = p.id and c.estado <> 'pagada') then 'saldado'
    when exists (select 1 from public.cuotas c
                 where c.prestamo_id = p.id and c.estado = 'atrasada') then 'atrasado'
    else 'activo'
  end
  where p.id = p_prestamo_id;
end;
$$;

-- Se invoca al cargar la aplicación: sin esto el contador de cuotas
-- atrasadas del panel se queda permanentemente en cero, porque nada
-- asignaba nunca el estado 'atrasada'.
create or replace function public.actualizar_atrasos()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    and fecha_vencimiento < current_date;

  get diagnostics v_n = row_count;

  update public.prestamos p set estado = case
    when not exists (select 1 from public.cuotas c
                     where c.prestamo_id = p.id and c.estado <> 'pagada') then 'saldado'
    when exists (select 1 from public.cuotas c
                 where c.prestamo_id = p.id and c.estado = 'atrasada') then 'atrasado'
    else 'activo'
  end
  where p.organizacion_id = v_org;

  -- Vencer cotizaciones cuya validez expiró
  update public.cotizaciones set estado = 'vencida'
  where organizacion_id = v_org
    and estado in ('borrador', 'enviada')
    and fecha + validez_dias < current_date;

  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- Eliminar cliente con comprobación de historial
-- ---------------------------------------------------------------------
create or replace function public.contar_historial_cliente(p_cliente_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'cotizaciones', (select count(*) from public.cotizaciones where cliente_id = p_cliente_id and organizacion_id = public.org_actual()),
    'facturas',     (select count(*) from public.facturas     where cliente_id = p_cliente_id and organizacion_id = public.org_actual()),
    'prestamos',    (select count(*) from public.prestamos    where cliente_id = p_cliente_id and organizacion_id = public.org_actual())
  );
$$;

-- Si el cliente tiene historial se da de baja lógica (se conserva la
-- trazabilidad fiscal); si no tiene nada, se borra de verdad.
create or replace function public.eliminar_cliente(p_cliente_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org  uuid := public.org_actual();
  v_hist jsonb := public.contar_historial_cliente(p_cliente_id);
begin
  if not exists (select 1 from public.clientes where id = p_cliente_id and organizacion_id = v_org) then
    raise exception 'Cliente no encontrado';
  end if;

  if (v_hist->>'cotizaciones')::int + (v_hist->>'facturas')::int + (v_hist->>'prestamos')::int > 0 then
    update public.clientes set activo = false where id = p_cliente_id and organizacion_id = v_org;
    return 'desactivado';
  end if;

  delete from public.clientes where id = p_cliente_id and organizacion_id = v_org;
  return 'eliminado';
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución: sólo usuarios autenticados
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
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
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
