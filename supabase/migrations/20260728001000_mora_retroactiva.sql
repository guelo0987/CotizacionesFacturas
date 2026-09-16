-- =====================================================================
-- Mora retroactiva: opcional, por préstamo
-- =====================================================================
-- Hasta ahora la mora siempre arrancaba el día en que se habilitaba. Pero
-- hay clientes a los que sí se les reclama lo ya atrasado, así que el
-- cobrador elige, igual que elige el modo:
--
--   · false (por defecto) corre desde el día en que se habilitó.
--   · true                cobra desde el vencimiento de cada cuota,
--                         alcanzando los atrasos anteriores.
--
-- El valor por defecto es `false` a propósito: encender la mora no puede
-- hacer aparecer de golpe una deuda que el cliente nunca supo que tenía,
-- salvo que se pida explícitamente.
-- =====================================================================

alter table public.prestamos
  add column if not exists mora_retroactiva boolean not null default false;

-- ---------------------------------------------------------------------
-- Acumulación: el arranque depende de si la mora es retroactiva
-- ---------------------------------------------------------------------
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
      round(
        p.mora_diaria
        * greatest(
            0,
            current_date - case
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
-- Configuración: se añade la elección de retroactividad
-- ---------------------------------------------------------------------
drop function if exists public.configurar_mora(uuid, boolean, numeric, text);

create or replace function public.configurar_mora(
  p_prestamo_id uuid,
  p_activa      boolean,
  p_diaria      numeric,
  p_modo        text,
  p_retroactiva boolean default false
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
    mora_activa      = p_activa,
    mora_diaria      = case when p_activa then round(coalesce(p_diaria, 0), 2) else mora_diaria end,
    mora_modo        = p_modo,
    mora_retroactiva = coalesce(p_retroactiva, false),
    -- Al habilitarla se guarda el día; si ya estaba activa se conserva el
    -- original para no reiniciar lo que el cliente venía acumulando.
    mora_desde       = case when p_activa then coalesce(v_desde, current_date) else null end
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

revoke all on function public.acumular_mora(uuid) from public, anon, authenticated;
revoke all on function public.configurar_mora(uuid, boolean, numeric, text, boolean) from public, anon;
grant execute on function public.configurar_mora(uuid, boolean, numeric, text, boolean) to authenticated;
