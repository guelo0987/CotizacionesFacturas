-- =====================================================================
-- Mora por atraso
-- =====================================================================
-- El prestamista habilita la mora préstamo por préstamo, cuando un cliente
-- se atrasa, y fija cuánto se cobra por cada día que pase.
--
-- Dos decisiones de negocio quedan grabadas aquí:
--
-- 1. La mora NUNCA es retroactiva. Al habilitarla se guarda el día
--    (`mora_desde`) y sólo cuenta a partir de ahí. Activarla en un
--    préstamo atrasado hace tres meses no puede hacer aparecer de golpe
--    una deuda que el cliente nunca supo que tenía.
--
-- 2. Con varias cuotas vencidas a la vez, el cobrador elige el criterio:
--    · `por_cuota`    cada cuota vencida acumula su propia mora diaria.
--    · `por_prestamo` una sola mora diaria, sobre la cuota más antigua.
--
-- El cobro se reparte explícitamente entre mora y cuota, y cada pago
-- guarda cuánto fue a cada cosa para que el recibo lo pueda detallar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------
alter table public.prestamos
  add column if not exists mora_activa boolean       not null default false,
  add column if not exists mora_diaria numeric(14,2) not null default 0,
  add column if not exists mora_modo   text          not null default 'por_cuota',
  add column if not exists mora_desde  date;

alter table public.prestamos drop constraint if exists chk_prestamos_mora;
alter table public.prestamos add  constraint chk_prestamos_mora
  check (mora_modo in ('por_cuota', 'por_prestamo') and mora_diaria >= 0);

alter table public.cuotas
  add column if not exists mora_acumulada numeric(14,2) not null default 0,
  add column if not exists mora_pagada    numeric(14,2) not null default 0;

alter table public.pagos
  add column if not exists monto_mora numeric(14,2) not null default 0;

-- ---------------------------------------------------------------------
-- 2. Acumulación de la mora
-- ---------------------------------------------------------------------
-- Es la única autoridad sobre la cifra: el cliente reproduce la fórmula
-- para la vista previa (ver src/utils/calculos.ts), pero lo que se cobra
-- es lo que esta función deja guardado.
create or replace function public.acumular_mora(p_prestamo_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
      -- Cuenta desde el vencimiento o desde que se habilitó la mora, lo
      -- que ocurra más tarde: así nunca cobra hacia atrás.
      round(
        p.mora_diaria
        * greatest(0, current_date - greatest(c.fecha_vencimiento, p.mora_desde)),
        2
      ) as mora,
      row_number() over (partition by p.id order by c.fecha_vencimiento, c.numero) as orden
    from public.cuotas c
    join public.prestamos p on p.id = c.prestamo_id
    where c.organizacion_id = v_org
      and p.mora_activa
      and p.mora_desde is not null
      and c.estado <> 'pagada'
      and c.fecha_vencimiento < current_date
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
$$;

-- ---------------------------------------------------------------------
-- 3. Estados: un préstamo con mora pendiente no está saldado
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
$$;

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
    and fecha + validez_dias < current_date;

  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Habilitar o quitar la mora de un préstamo
-- ---------------------------------------------------------------------
-- Va aparte de `guardar_prestamo` a propósito: la mora se habilita cuando
-- el cliente ya se atrasó, y para entonces el préstamo suele tener pagos
-- registrados, que es justo lo que impide editarlo (editar regenera el
-- calendario de cuotas).
create or replace function public.configurar_mora(
  p_prestamo_id uuid,
  p_activa      boolean,
  p_diaria      numeric,
  p_modo        text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    mora_activa = p_activa,
    mora_diaria = case when p_activa then round(coalesce(p_diaria, 0), 2) else mora_diaria end,
    mora_modo   = p_modo,
    -- Al habilitarla arranca hoy; si ya estaba activa se conserva el día
    -- original para no reiniciar lo que el cliente ya venía acumulando.
    mora_desde  = case when p_activa then coalesce(v_desde, current_date) else null end
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
$$;

-- ---------------------------------------------------------------------
-- 5. Cobro: el pago se reparte entre mora y cuota
-- ---------------------------------------------------------------------
-- La firma cambia, así que hay que soltar la anterior: dejar las dos haría
-- ambigua cualquier llamada con cuatro argumentos.
drop function if exists public.registrar_pago_cuota(uuid, numeric, text, text);

create or replace function public.registrar_pago_cuota(
  p_cuota_id   uuid,
  p_monto      numeric,
  p_metodo     text,
  p_referencia text default null,
  p_monto_mora numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
                     when fecha_vencimiento < current_date then 'atrasada'
                     else 'pendiente'
                   end
  where id = p_cuota_id;

  perform public.recalcular_estado_prestamo(v_prestamo);

  return public.obtener_prestamo(v_prestamo);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Permisos
-- ---------------------------------------------------------------------
-- `acumular_mora` es auxiliar interna: la llaman las otras funciones, no
-- debe quedar expuesta como endpoint.
revoke all on function public.acumular_mora(uuid) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.configurar_mora(uuid, boolean, numeric, text)',
    'public.registrar_pago_cuota(uuid, numeric, text, text, numeric)',
    'public.recalcular_estado_prestamo(uuid)',
    'public.actualizar_atrasos()'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
