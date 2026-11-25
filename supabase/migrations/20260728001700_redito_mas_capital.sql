-- =====================================================================
-- Préstamos con cuotas: cobrar el rédito y, si quiere, abonar a capital
-- =====================================================================
-- «Solo el rédito» pasa a ser «Rédito + capital»:
--   · lo que la cuota ya tenía abonado cuenta primero para el rédito;
--   · se cobra lo que falte del rédito, la mora y lo que el cliente quiera
--     poner a capital (menos que el capital de la cuota: si lo paga todo,
--     es la cuota completa);
--   · la cuota queda pagada con el rédito y ese capital, y lo que faltó de
--     capital se corre con ella: esta cuota y las siguientes se corren un
--     periodo y el préstamo dura uno más.
--
-- Ejemplo (cuota de 3,500 = 1,000 de rédito + 2,500 de capital, con 500
-- ya abonados): cobra 500 de rédito + 500 a capital. La cuota queda en
-- 1,500 pagada y la siguiente lleva 2,000 de capital + 1,000 de rédito.
-- =====================================================================

alter table public.pagos add column if not exists abono_capital numeric not null default 0;
alter table public.pagos drop constraint if exists chk_pagos_abono_capital;
alter table public.pagos add constraint chk_pagos_abono_capital check (abono_capital >= 0);
comment on column public.pagos.abono_capital is
  'Cobro de rédito + capital: la parte de este pago que fue a capital.';

drop function if exists public.pagar_solo_redito(uuid, text, text);

create or replace function public.pagar_solo_redito(
  p_cuota_id   uuid,
  p_metodo     text,
  p_referencia text default null,
  p_capital    numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := public.org_actual();
  v_cuota    public.cuotas;
  v_p        public.prestamos;
  v_mora     numeric;
  v_paso     interval;
  v_nueva    uuid;
  v_ref      text := nullif(trim(coalesce(p_referencia, '')), '');
  v_metodo   text := coalesce(p_metodo, 'efectivo');
  v_abono    numeric := round(coalesce(p_capital, 0), 2);
  v_prev_int numeric;   -- de lo ya abonado, lo que cubre el rédito
  v_prev_cap numeric;   -- de lo ya abonado, lo que pasó del rédito
  v_falta    numeric;   -- rédito que falta cobrar
  v_cap_pag  numeric;   -- capital de la cuota que queda pagado
  v_cobro    numeric;
begin
  select * into v_cuota from public.cuotas
   where id = p_cuota_id and organizacion_id = v_org
     for update;
  if not found then
    raise exception 'Cuota no encontrada';
  end if;

  select * into v_p from public.prestamos where id = v_cuota.prestamo_id for update;

  if v_p.modalidad_interes = 'redito' then
    raise exception 'En un préstamo a rédito cada cuota ya es sólo el rédito: cóbrala normal.';
  end if;
  if v_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'otro') then
    raise exception 'Método de pago inválido';
  end if;
  if v_abono < 0 then
    raise exception 'El abono a capital no puede ser negativo';
  end if;

  perform public.acumular_mora(v_p.id);
  select * into v_cuota from public.cuotas where id = p_cuota_id;

  if v_cuota.estado = 'pagada' then
    raise exception 'Esta cuota ya está pagada';
  end if;
  if coalesce(v_cuota.interes, 0) <= 0 or coalesce(v_cuota.capital, 0) <= 0 then
    raise exception 'Esta cuota no tiene el rédito separado del capital, así que no se puede cobrar sólo el rédito.';
  end if;

  v_prev_int := least(v_cuota.monto_pagado, v_cuota.interes);
  v_prev_cap := round(v_cuota.monto_pagado - v_prev_int, 2);
  v_falta    := round(v_cuota.interes - v_prev_int, 2);
  v_cap_pag  := round(v_prev_cap + v_abono, 2);
  v_mora     := round(greatest(0, v_cuota.mora_acumulada - v_cuota.mora_pagada), 2);
  v_cobro    := round(v_falta + v_abono + v_mora, 2);

  if v_cap_pag >= v_cuota.capital then
    raise exception 'Con ese abono se paga la cuota completa (faltan %). Cóbrala con «Cuota completa».',
      public.pesos(v_cuota.monto - v_cuota.monto_pagado);
  end if;

  v_paso := public.paso_frecuencia(v_p.frecuencia);

  -- Esta cuota y las siguientes se corren un periodo. La que se cobra se
  -- queda sólo con el capital que faltó, su rédito y nada abonado.
  with orden as (
    select id,
           lead(fecha_vencimiento) over (order by numero) as siguiente,
           fecha_vencimiento
      from public.cuotas
     where prestamo_id = v_p.id
  )
  update public.cuotas c set
    numero            = c.numero + 1,
    fecha_vencimiento = coalesce(o.siguiente, (o.fecha_vencimiento + v_paso)::date),
    capital           = case when c.id = v_cuota.id then round(c.capital - v_cap_pag, 2) else c.capital end,
    monto             = case when c.id = v_cuota.id then round(c.monto - v_cap_pag, 2) else c.monto end,
    monto_pagado      = case when c.id = v_cuota.id then 0 else c.monto_pagado end,
    mora_acumulada    = case when c.id = v_cuota.id then 0 else c.mora_acumulada end,
    mora_pagada       = case when c.id = v_cuota.id then 0 else c.mora_pagada end,
    estado            = case
                          when c.id <> v_cuota.id and c.monto_pagado >= c.monto then 'pagada'
                          when c.id <> v_cuota.id and c.monto_pagado > 0 then 'parcial'
                          when coalesce(o.siguiente, (o.fecha_vencimiento + v_paso)::date) < public.hoy_negocio()
                            then 'atrasada'
                          else 'pendiente'
                        end
  from orden o
  where o.id = c.id
    and c.numero >= v_cuota.numero;

  -- En su lugar queda la cuota del periodo, pagada: rédito + capital abonado
  insert into public.cuotas (
    organizacion_id, prestamo_id, numero, fecha_vencimiento,
    monto, interes, capital, saldo_capital, monto_pagado,
    mora_acumulada, mora_pagada, estado
  ) values (
    v_org, v_p.id, v_cuota.numero, v_cuota.fecha_vencimiento,
    round(v_cuota.interes + v_cap_pag, 2), v_cuota.interes, v_cap_pag,
    round(coalesce(v_cuota.saldo_capital, 0) + v_cuota.capital - v_cap_pag, 2),
    round(v_cuota.interes + v_cap_pag, 2),
    v_cuota.mora_acumulada, v_cuota.mora_acumulada, 'pagada'
  ) returning id into v_nueva;

  -- Los abonos que ya tenía la cuota eran de este periodo: van con ella
  update public.pagos set cuota_id = v_nueva where cuota_id = v_cuota.id;
  update public.movimientos_credito set cuota_id = v_nueva where cuota_id = v_cuota.id;

  update public.prestamos set
    num_cuotas    = num_cuotas + 1,
    interes_total = round(interes_total + v_cuota.interes, 2),
    total_a_pagar = round(total_a_pagar + v_cuota.interes, 2)
  where id = v_p.id;

  if v_cobro > 0 then
    insert into public.pagos (
      organizacion_id, prestamo_id, cuota_id, monto, monto_mora, fecha, metodo, referencia,
      solo_redito, abono_capital
    ) values (
      v_org, v_p.id, v_nueva, v_cobro, v_mora, now(), v_metodo, v_ref, true, v_abono
    );
  end if;

  perform public.recalcular_estado_prestamo(v_p.id);

  return public.obtener_prestamo(v_p.id);
end;
$$;

revoke all on function public.pagar_solo_redito(uuid, text, text, numeric) from public, anon;
grant execute on function public.pagar_solo_redito(uuid, text, text, numeric) to authenticated;
