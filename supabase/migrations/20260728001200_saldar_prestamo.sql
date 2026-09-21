-- =====================================================================
-- Saldar el préstamo de una vez
-- =====================================================================
-- El cliente liquida todo lo que debe en un solo pago: cada cuota que
-- queda pendiente completa, con sus intereses —también los de las cuotas
-- que todavía no han vencido, porque el préstamo se pactó así—, más la
-- mora acumulada. Sin la mora el préstamo no quedaría saldado, que es lo
-- que el botón promete.
--
-- Se registra un pago por cada cuota que se liquida, igual que un abono
-- normal: así el historial de cada cuota sigue siendo correcto. Todos
-- llevan la marca `saldo_de_prestamo` para poder reunirlos después y
-- reimprimir el recibo de saldo.
-- =====================================================================

alter table public.pagos
  add column if not exists saldo_de_prestamo boolean not null default false;

create or replace function public.saldar_prestamo(
  p_prestamo_id    uuid,
  p_monto_esperado numeric,
  p_metodo         text,
  p_referencia     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid := public.org_actual();
  v_total     numeric;
  v_resta     numeric;
  v_mora      numeric;
  v_ref       text := nullif(trim(coalesce(p_referencia, '')), '');
  v_cuota     public.cuotas;
begin
  if v_org is null then
    raise exception 'Usuario sin organización asignada';
  end if;

  perform 1 from public.prestamos
  where id = p_prestamo_id and organizacion_id = v_org
  for update;

  if not found then
    raise exception 'Préstamo no encontrado';
  end if;

  -- La mora se pone al día antes de calcular, para cobrar la cifra de hoy
  perform public.acumular_mora(p_prestamo_id);

  select round(coalesce(sum(
           greatest(0, monto - monto_pagado) + greatest(0, mora_acumulada - mora_pagada)
         ), 0), 2)
    into v_total
    from public.cuotas
   where prestamo_id = p_prestamo_id;

  if v_total <= 0 then
    raise exception 'El préstamo ya está saldado';
  end if;

  -- El cobrador confirmó una cifra en pantalla. Si entre tanto cambió —la
  -- mora pudo sumar un día—, se detiene en vez de cobrar un monto distinto
  -- del que vio.
  if round(coalesce(p_monto_esperado, 0), 2) <> v_total then
    raise exception 'El total para saldar cambió: ahora es RD$%. Revisa la cifra y confirma de nuevo.',
      to_char(v_total, 'FM999,999,990.00');
  end if;

  for v_cuota in
    select * from public.cuotas
     where prestamo_id = p_prestamo_id
     order by numero
     for update
  loop
    v_resta := round(greatest(0, v_cuota.monto - v_cuota.monto_pagado), 2);
    v_mora  := round(greatest(0, v_cuota.mora_acumulada - v_cuota.mora_pagada), 2);

    continue when v_resta + v_mora <= 0;

    insert into public.pagos (
      organizacion_id, prestamo_id, cuota_id, monto, monto_mora,
      fecha, metodo, referencia, saldo_de_prestamo
    ) values (
      v_org, p_prestamo_id, v_cuota.id, round(v_resta + v_mora, 2), v_mora,
      now(), coalesce(p_metodo, 'efectivo'), v_ref, true
    );

    update public.cuotas set
      monto_pagado = monto,
      mora_pagada  = mora_acumulada,
      estado       = 'pagada'
    where id = v_cuota.id;
  end loop;

  perform public.recalcular_estado_prestamo(p_prestamo_id);

  return public.obtener_prestamo(p_prestamo_id);
end;
$$;

revoke all on function public.saldar_prestamo(uuid, numeric, text, text) from public, anon;
grant execute on function public.saldar_prestamo(uuid, numeric, text, text) to authenticated;
