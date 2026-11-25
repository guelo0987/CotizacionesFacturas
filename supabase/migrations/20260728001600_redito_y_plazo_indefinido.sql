-- =====================================================================
-- Préstamos a rédito (plazo indefinido) y «cobrar solo el rédito»
-- =====================================================================
-- 1. Préstamo a rédito: no tiene número de cuotas. Cada periodo se cobra
--    el rédito (tasa × capital que se debe al empezar el periodo) y lo que
--    el cliente dé de más baja el capital, así el rédito siguiente es menor.
--    Termina cuando paga todo el capital.
--
--    Se apoya en las mismas cuotas de siempre, para que cobrar, saldar, la
--    mora, el cuadre y los recibos funcionen sin rehacerse:
--      · el capital es una cuota especial (`es_capital`, número 9999, sin
--        fecha real) que se va abonando;
--      · cada rédito es una cuota normal que `generar_reditos` crea cuando
--        empieza su periodo.
--
--    Reglas que eligió el negocio:
--      · un abono a capital baja el rédito desde el periodo siguiente; el del
--        periodo que corre no cambia;
--      · el periodo siguiente se crea cuando ha pasado su primer día, así que
--        lo pagado el día del vencimiento ya cuenta para el rédito siguiente;
--      · para saldar se paga el capital y el rédito del periodo en curso.
--
-- 2. Cobrar solo el rédito de una cuota en un préstamo con cuotas: se cobra
--    el interés de esa cuota (y su mora) y esa cuota y las siguientes se
--    corren un periodo. El préstamo dura un periodo más.
-- =====================================================================

alter table public.prestamos drop constraint if exists chk_prestamos_modalidad;
alter table public.prestamos add  constraint chk_prestamos_modalidad
  check (modalidad_interes in ('por_periodo', 'amortizado', 'fijo_total', 'redito'));

-- Un préstamo a rédito, o uno al que se le cobra solo el rédito varias
-- veces, puede pasar de 120 periodos.
alter table public.prestamos drop constraint if exists chk_prestamos_montos;
alter table public.prestamos add  constraint chk_prestamos_montos
  check (monto_prestado > 0 and tasa_interes >= 0 and num_cuotas >= 1 and num_cuotas <= 1000);

alter table public.cuotas add column if not exists es_capital boolean not null default false;
comment on column public.cuotas.es_capital is
  'Préstamo a rédito: la cuota que representa el capital y se va abonando. No vence.';

alter table public.pagos add column if not exists solo_redito boolean not null default false;
comment on column public.pagos.solo_redito is
  'Pago de solo el rédito de una cuota: la cuota y las siguientes se corrieron un periodo.';

-- ---------------------------------------------------------------------
-- Duración de un periodo según la frecuencia
-- ---------------------------------------------------------------------
create or replace function public.paso_frecuencia(p_frecuencia text)
returns interval
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_frecuencia
           when 'diario'     then interval '1 day'
           when 'semanal'    then interval '7 days'
           when 'quincenal'  then interval '15 days'
           when 'mensual'    then interval '1 month'
           when 'bimestral'  then interval '2 months'
           when 'trimestral' then interval '3 months'
           when 'semestral'  then interval '6 months'
           else                   interval '1 year'
         end
$$;

-- ---------------------------------------------------------------------
-- Crear los réditos de los periodos que ya empezaron
-- ---------------------------------------------------------------------
-- El rédito del periodo n se calcula sobre el capital que se debía al
-- empezar ese periodo, contando lo abonado ese mismo día. Así da igual
-- cuándo se abra la aplicación: la cifra es siempre la misma.
create or replace function public.generar_reditos(p_prestamo_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := public.org_actual();
  v_p        public.prestamos;
  v_capital_id uuid;
  v_n        integer;
  v_inicio   date;
  v_capital  numeric;
  v_interes  numeric;
  v_vence    date;
  v_vueltas  integer;
begin
  if v_org is null then
    return;
  end if;

  for v_p in
    select * from public.prestamos
     where organizacion_id = v_org
       and modalidad_interes = 'redito'
       and estado <> 'saldado'
       and (p_prestamo_id is null or id = p_prestamo_id)
     for update
  loop
    select id into v_capital_id from public.cuotas
     where prestamo_id = v_p.id and es_capital;
    continue when v_capital_id is null;

    v_vueltas := 0;
    loop
      v_vueltas := v_vueltas + 1;
      exit when v_vueltas > 2000;  -- red de seguridad

      select coalesce(max(numero), 0) + 1 into v_n
        from public.cuotas where prestamo_id = v_p.id and not es_capital;

      v_inicio := (v_p.fecha_inicio + public.paso_frecuencia(v_p.frecuencia) * (v_n - 1))::date;
      -- El primer rédito existe desde el día del préstamo; los demás, cuando
      -- ya pasó el primer día de su periodo.
      exit when v_n > 1 and v_inicio >= public.hoy_negocio();

      select round(v_p.monto_prestado - coalesce(sum(
               pg.monto + pg.credito_usado - pg.excedente - pg.monto_mora), 0), 2)
        into v_capital
        from public.pagos pg
       where pg.cuota_id = v_capital_id
         and (pg.fecha at time zone 'America/Santo_Domingo')::date <= v_inicio;

      exit when v_capital <= 0;

      v_interes := round(v_capital * v_p.tasa_interes / 100, 2);
      exit when v_interes <= 0;

      v_vence := (v_p.fecha_inicio + public.paso_frecuencia(v_p.frecuencia) * v_n)::date;

      insert into public.cuotas (
        organizacion_id, prestamo_id, numero, fecha_vencimiento,
        monto, interes, capital, saldo_capital, monto_pagado, estado
      ) values (
        v_p.organizacion_id, v_p.id, v_n, v_vence,
        v_interes, v_interes, 0, v_capital, 0,
        case when v_vence < public.hoy_negocio() then 'atrasada' else 'pendiente' end
      );

      update public.prestamos set
        num_cuotas    = v_n,
        interes_total = round(interes_total + v_interes, 2),
        total_a_pagar = round(total_a_pagar + v_interes, 2)
      where id = v_p.id;
    end loop;
  end loop;
end;
$$;

revoke all on function public.generar_reditos(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- La mora (que se pone al día en cada cobro y al abrir la aplicación)
-- crea antes los réditos que falten: así todos los caminos los ven.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acumular_mora(p_prestamo_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_org uuid := public.org_actual();
begin
  if v_org is null then
    return;
  end if;

  -- Préstamos a rédito: crear los periodos que ya empezaron
  perform public.generar_reditos(p_prestamo_id);

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
$$;

revoke all on function public.acumular_mora(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Guardar préstamo: admite el préstamo a rédito
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
  v_modalidad  text    := coalesce(p_datos->>'modalidad_interes', 'por_periodo');
  v_redito     boolean;  -- plazo indefinido: se cobra el rédito hasta que pague el capital
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
  v_redito := v_modalidad = 'redito';
  if v_redito then
    -- Las cuotas de rédito se van creando solas, periodo a periodo
    v_num := 1;
    if v_tasa <= 0 then
      raise exception 'Un préstamo a rédito necesita un rédito mayor que cero';
    end if;
  elsif v_num is null or v_num < 1 or v_num > 120 then
    raise exception 'El número de cuotas debe estar entre 1 y 120';
  end if;
  if v_frecuencia not in ('diario', 'semanal', 'quincenal', 'mensual',
                          'bimestral', 'trimestral', 'semestral', 'anual') then
    raise exception 'Frecuencia inválida: %', v_frecuencia;
  end if;
  if v_modalidad not in ('por_periodo', 'amortizado', 'fijo_total', 'redito') then
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

  for i in 1..(case when v_redito then 0 else v_num end) loop
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
  -- A rédito: el interés se va sumando con cada periodo que se genera

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

  if v_redito then
    -- El capital es una «cuota» sin fecha que se va abonando; los réditos
    -- los crea `generar_reditos`, uno por periodo.
    insert into public.cuotas (
      organizacion_id, prestamo_id, numero, fecha_vencimiento,
      monto, interes, capital, saldo_capital, monto_pagado, estado, es_capital
    ) values (
      v_org, v_id, 9999, date '9999-12-31',
      v_monto, 0, v_monto, 0, 0, 'pendiente', true
    );
    perform public.generar_reditos(v_id);
  else
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
  end if;

  -- Marcar atrasos y poner el estado al día antes de devolverlo. Sin esto,
  -- un préstamo registrado con fechas ya pasadas —lo normal al meter en el
  -- sistema uno que venía de antes— aparecía «al día» hasta la siguiente
  -- recarga de la aplicación, y su mora no empezaba a contar.
  perform public.recalcular_estado_prestamo(v_id);

  return public.obtener_prestamo(v_id);
end;
$$;
revoke all on function public.guardar_prestamo(jsonb) from public, anon;
grant execute on function public.guardar_prestamo(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Cobrar solo el rédito de una cuota (préstamos con cuotas)
-- ---------------------------------------------------------------------
create or replace function public.pagar_solo_redito(
  p_cuota_id   uuid,
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
  v_cuota  public.cuotas;
  v_p      public.prestamos;
  v_mora   numeric;
  v_paso   interval;
  v_nueva  uuid;
  v_ref    text := nullif(trim(coalesce(p_referencia, '')), '');
  v_metodo text := coalesce(p_metodo, 'efectivo');
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

  perform public.acumular_mora(v_p.id);
  select * into v_cuota from public.cuotas where id = p_cuota_id;

  if v_cuota.estado = 'pagada' then
    raise exception 'Esta cuota ya está pagada';
  end if;
  if v_cuota.monto_pagado > 0 then
    raise exception 'Esta cuota ya tiene un abono de %. «Solo rédito» es para cuotas sin abonos: cobra lo que falta de forma normal.',
      public.pesos(v_cuota.monto_pagado);
  end if;
  if coalesce(v_cuota.interes, 0) <= 0 or coalesce(v_cuota.capital, 0) <= 0 then
    raise exception 'Esta cuota no tiene el rédito separado del capital, así que no se puede cobrar solo el rédito.';
  end if;

  v_mora := round(greatest(0, v_cuota.mora_acumulada - v_cuota.mora_pagada), 2);
  v_paso := public.paso_frecuencia(v_p.frecuencia);

  -- Esta cuota y las siguientes se corren un periodo: cada una toma la
  -- fecha de la que le sigue, y la última un periodo más.
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
    -- La mora de la cuota cobrada se paga ahora y se queda en su lugar
    mora_acumulada    = case when c.id = v_cuota.id then 0 else c.mora_acumulada end,
    mora_pagada       = case when c.id = v_cuota.id then 0 else c.mora_pagada end,
    estado            = case
                          when c.monto_pagado >= c.monto then 'pagada'
                          when c.monto_pagado > 0 then 'parcial'
                          when coalesce(o.siguiente, (o.fecha_vencimiento + v_paso)::date) < public.hoy_negocio()
                            then 'atrasada'
                          else 'pendiente'
                        end
  from orden o
  where o.id = c.id
    and c.numero >= v_cuota.numero;

  -- En su lugar queda una cuota de solo rédito, ya pagada
  insert into public.cuotas (
    organizacion_id, prestamo_id, numero, fecha_vencimiento,
    monto, interes, capital, saldo_capital, monto_pagado,
    mora_acumulada, mora_pagada, estado
  ) values (
    v_org, v_p.id, v_cuota.numero, v_cuota.fecha_vencimiento,
    v_cuota.interes, v_cuota.interes, 0, round(coalesce(v_cuota.saldo_capital, 0) + v_cuota.capital, 2),
    v_cuota.interes, v_cuota.mora_acumulada, v_cuota.mora_acumulada, 'pagada'
  ) returning id into v_nueva;

  update public.prestamos set
    num_cuotas    = num_cuotas + 1,
    interes_total = round(interes_total + v_cuota.interes, 2),
    total_a_pagar = round(total_a_pagar + v_cuota.interes, 2)
  where id = v_p.id;

  insert into public.pagos (
    organizacion_id, prestamo_id, cuota_id, monto, monto_mora, fecha, metodo, referencia, solo_redito
  ) values (
    v_org, v_p.id, v_nueva, round(v_cuota.interes + v_mora, 2), v_mora, now(), v_metodo, v_ref, true
  );

  perform public.recalcular_estado_prestamo(v_p.id);

  return public.obtener_prestamo(v_p.id);
end;
$$;

revoke all on function public.pagar_solo_redito(uuid, text, text) from public, anon;
grant execute on function public.pagar_solo_redito(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Préstamo a rédito: cobrar el rédito y, en el mismo cobro, abonar capital
-- ---------------------------------------------------------------------
-- Reutiliza `registrar_pago_cuota` para las dos partes, así la mora, el
-- saldo a favor y los recibos se comportan igual que en cualquier cuota.
create or replace function public.cobrar_redito(
  p_cuota_id   uuid,
  p_monto      numeric,
  p_metodo     text,
  p_referencia text default null,
  p_monto_mora numeric default 0,
  p_credito    numeric default 0,
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
  v_capital  public.cuotas;
  v_abono    numeric := round(coalesce(p_capital, 0), 2);
  v_redito   numeric := round(coalesce(p_monto, 0) + coalesce(p_credito, 0), 2);
  v_resta    numeric;
begin
  select * into v_cuota from public.cuotas
   where id = p_cuota_id and organizacion_id = v_org;
  if not found then
    raise exception 'Cuota no encontrada';
  end if;

  select * into v_p from public.prestamos where id = v_cuota.prestamo_id for update;
  if v_p.modalidad_interes <> 'redito' then
    raise exception 'Este préstamo no es a rédito';
  end if;
  if v_cuota.es_capital then
    raise exception 'Para abonar sólo a capital usa el cobro de la cuota de capital';
  end if;
  if v_abono < 0 then
    raise exception 'El abono a capital no puede ser negativo';
  end if;
  if v_redito <= 0 and v_abono <= 0 then
    raise exception 'El monto del cobro debe ser mayor que cero';
  end if;

  select * into v_capital from public.cuotas
   where prestamo_id = v_p.id and es_capital
     for update;
  v_resta := round(greatest(0, v_capital.monto - v_capital.monto_pagado), 2);
  if v_abono > v_resta then
    raise exception 'El abono a capital (%) supera el capital que se debe (%).',
      public.pesos(v_abono), public.pesos(v_resta);
  end if;

  if v_redito > 0 then
    perform public.registrar_pago_cuota(
      p_cuota_id, p_monto, p_metodo, p_referencia, p_monto_mora, p_credito
    );
  end if;

  if v_abono > 0 then
    perform public.registrar_pago_cuota(v_capital.id, v_abono, p_metodo, p_referencia, 0, 0);
  end if;

  return public.obtener_prestamo(v_p.id);
end;
$$;

revoke all on function public.cobrar_redito(uuid, numeric, text, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.cobrar_redito(uuid, numeric, text, text, numeric, numeric, numeric) to authenticated;
