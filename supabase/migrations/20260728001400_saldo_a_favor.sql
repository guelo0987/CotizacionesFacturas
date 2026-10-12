-- =====================================================================
-- Saldo a favor del cliente
-- =====================================================================
-- Cuando un cliente entrega más de lo que debe —en una cuota, una factura
-- o al saldar un préstamo— el excedente ya no se rechaza: queda como saldo
-- a su favor. También puede dejar un anticipo sin deber nada. Ese saldo
-- sirve para pagar cualquier deuda suya (cuotas, su mora y facturas), pero
-- sólo cuando el cobrador decide usarlo, y se le puede devolver.
--
-- El saldo vive en un libro de movimientos por cliente, no en una columna:
-- cada peso queda trazable —de qué abono salió, en qué cuota se usó, cuándo
-- se devolvió— y no se pierde si se borra el préstamo de donde vino, porque
-- los pagos sí se borran en cascada con su documento.
--
-- `pagos.monto` sigue siendo el dinero que entró en esa operación. Lo que
-- se pagó con saldo a favor va en `credito_usado` y lo que sobró en
-- `excedente`, así el «cobrado» de los reportes nunca cuenta dos veces:
--   aplicado a la deuda = monto + credito_usado − excedente
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El libro de saldo a favor
-- ---------------------------------------------------------------------
create table if not exists public.movimientos_credito (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  -- Un cliente con movimientos no se borra: se desactiva, y sólo con saldo
  -- cero. La comprobación es al final de la sentencia, para que borrar una
  -- organización entera pueda arrastrar clientes y movimientos a la vez.
  cliente_id      uuid not null references public.clientes(id),
  tipo            text not null,
  monto           numeric not null,
  pago_id         uuid references public.pagos(id) on delete set null,
  prestamo_id     uuid references public.prestamos(id) on delete set null,
  factura_id      uuid references public.facturas(id) on delete set null,
  cuota_id        uuid references public.cuotas(id) on delete set null,
  -- Referencia legible del documento de origen, que sobrevive a su borrado
  documento       text,
  metodo          text,
  referencia      text,
  nota            text,
  fecha           timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  constraint chk_movimientos_credito_tipo
    check (tipo in ('excedente', 'anticipo', 'uso', 'devolucion', 'anulacion')),
  -- Lo que entra suma, lo que sale resta; una anulación revierte en el sentido que toque
  constraint chk_movimientos_credito_signo check (
    (tipo in ('excedente', 'anticipo') and monto > 0)
    or (tipo in ('uso', 'devolucion') and monto < 0)
    or (tipo = 'anulacion' and monto <> 0)
  ),
  constraint chk_movimientos_credito_centavos check (monto = round(monto, 2))
);

create index if not exists idx_movimientos_credito_cliente
  on public.movimientos_credito (organizacion_id, cliente_id, fecha);
create index if not exists idx_movimientos_credito_pago     on public.movimientos_credito (pago_id);
create index if not exists idx_movimientos_credito_prestamo on public.movimientos_credito (prestamo_id);
create index if not exists idx_movimientos_credito_factura  on public.movimientos_credito (factura_id);
create index if not exists idx_movimientos_credito_cuota    on public.movimientos_credito (cuota_id);

-- Se lee como el resto de las tablas, pero sólo se escribe a través de las
-- funciones: así nadie puede inventarse saldo ni dejarlo en negativo.
alter table public.movimientos_credito enable row level security;

drop policy if exists "lectura por organizacion" on public.movimientos_credito;
create policy "lectura por organizacion" on public.movimientos_credito
  for select to authenticated
  using (organizacion_id = (select public.org_actual()));

revoke all on public.movimientos_credito from public, anon, authenticated;
grant select on public.movimientos_credito to authenticated;

-- ---------------------------------------------------------------------
-- 2. Los pagos registran el saldo usado y el excedente
-- ---------------------------------------------------------------------
alter table public.pagos
  add column if not exists credito_usado numeric not null default 0,
  add column if not exists excedente     numeric not null default 0;

-- Un pago hecho todo con saldo a favor no trae efectivo: el monto puede ser
-- cero siempre que algo se pague, y lo que sobra sale del efectivo.
alter table public.pagos drop constraint if exists chk_pagos_monto_positivo;
alter table public.pagos drop constraint if exists chk_pagos_montos;
alter table public.pagos add constraint chk_pagos_montos check (
  monto >= 0
  and credito_usado >= 0
  and excedente >= 0
  and excedente <= monto
  and monto + credito_usado > 0
);

alter table public.pagos drop constraint if exists chk_pagos_metodo;
alter table public.pagos add constraint chk_pagos_metodo check (
  metodo = any (array['efectivo', 'transferencia', 'tarjeta', 'otro', 'saldo_a_favor'])
);

-- ---------------------------------------------------------------------
-- 3. Saldo de un cliente
-- ---------------------------------------------------------------------
create or replace function public.saldo_credito(p_cliente_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(round(sum(monto), 2), 0)
  from public.movimientos_credito
  where cliente_id = p_cliente_id and organizacion_id = public.org_actual();
$$;

-- Texto con formato de pesos para los mensajes de error
create or replace function public.pesos(p_monto numeric)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'RD$' || to_char(round(coalesce(p_monto, 0), 2), 'FM999,999,999,990.00')
$$;

-- ---------------------------------------------------------------------
-- 4. Abono de cuota: acepta excedente y saldo a favor
-- ---------------------------------------------------------------------
-- `p_monto` es el efectivo recibido y `p_credito` el saldo a favor que el
-- cobrador decidió usar. Lo entregado se reparte en mora (lo que indique
-- `p_monto_mora`) y cuota; lo que pase de la cuota queda a favor.
drop function if exists public.registrar_pago_cuota(uuid, numeric, text, text, numeric);

create or replace function public.registrar_pago_cuota(
  p_cuota_id   uuid,
  p_monto      numeric,
  p_metodo     text,
  p_referencia text default null,
  p_monto_mora numeric default 0,
  p_credito    numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org        uuid := public.org_actual();
  v_cuota      public.cuotas;
  v_prestamo   uuid;
  v_cliente    uuid;
  v_documento  text;
  v_efectivo   numeric := round(coalesce(p_monto, 0), 2);
  v_credito    numeric := round(coalesce(p_credito, 0), 2);
  v_mora       numeric := round(coalesce(p_monto_mora, 0), 2);
  v_entregado  numeric;
  v_a_cuota    numeric;
  v_excedente  numeric := 0;
  v_mora_pend  numeric;
  v_restante   numeric;
  v_saldo      numeric;
  v_nuevo      numeric;
  v_metodo     text;
  v_ref        text := nullif(trim(coalesce(p_referencia, '')), '');
  v_pago       uuid;
begin
  select * into v_cuota from public.cuotas
  where id = p_cuota_id and organizacion_id = v_org
  for update;

  if not found then
    raise exception 'Cuota no encontrada';
  end if;

  v_prestamo := v_cuota.prestamo_id;
  select cliente_id, 'PRE-' || upper(left(id::text, 8))
    into v_cliente, v_documento
    from public.prestamos where id = v_prestamo;

  -- Poner la mora al día ANTES de cobrar: el reparto tiene que hacerse
  -- sobre la cifra de hoy, no sobre la de la última vez que se abrió la
  -- aplicación.
  perform public.acumular_mora(v_prestamo);
  select * into v_cuota from public.cuotas where id = p_cuota_id;

  v_mora_pend := round(greatest(0, v_cuota.mora_acumulada - v_cuota.mora_pagada), 2);
  v_restante  := round(greatest(0, v_cuota.monto - v_cuota.monto_pagado), 2);
  v_entregado := round(v_efectivo + v_credito, 2);

  if v_efectivo < 0 then
    raise exception 'El efectivo recibido no puede ser negativo';
  end if;
  if v_credito < 0 then
    raise exception 'El saldo a favor usado no puede ser negativo';
  end if;
  if v_entregado <= 0 then
    raise exception 'El monto del abono debe ser mayor que cero';
  end if;
  if v_restante + v_mora_pend <= 0 then
    raise exception 'Esta cuota ya está saldada. Si el cliente quiere dejar dinero a su favor, regístralo como anticipo en su ficha.';
  end if;
  if v_mora < 0 then
    raise exception 'La parte de mora no puede ser negativa';
  end if;
  if v_mora > v_mora_pend then
    raise exception 'La parte de mora (%) supera la mora pendiente (%)', v_mora, v_mora_pend;
  end if;
  if v_mora > v_entregado then
    raise exception 'La parte de mora no puede superar el total entregado';
  end if;

  v_a_cuota := round(v_entregado - v_mora, 2);
  if v_a_cuota > v_restante then
    v_excedente := round(v_a_cuota - v_restante, 2);
    v_a_cuota   := v_restante;
  end if;

  if v_credito > 0 then
    -- Usar saldo y a la vez dejar sobrante no tiene sentido: el saldo es
    -- para cubrir lo que el efectivo no alcanza.
    if v_excedente > 0 then
      raise exception 'Con saldo a favor no puede sobrar dinero: usa sólo lo que falta para cubrir la deuda (%).',
        public.pesos(v_restante + v_mora_pend - v_efectivo);
    end if;

    -- Se bloquea al cliente para que dos cobros a la vez no gasten el mismo saldo
    perform 1 from public.clientes where id = v_cliente and organizacion_id = v_org for update;
    v_saldo := public.saldo_credito(v_cliente);
    if v_credito > v_saldo then
      raise exception 'El cliente sólo tiene % de saldo a favor.', public.pesos(v_saldo);
    end if;
  end if;

  v_nuevo  := round(v_cuota.monto_pagado + v_a_cuota, 2);
  v_metodo := case when v_efectivo = 0 then 'saldo_a_favor' else coalesce(p_metodo, 'efectivo') end;

  insert into public.pagos (
    organizacion_id, prestamo_id, cuota_id, monto, monto_mora, credito_usado, excedente,
    fecha, metodo, referencia
  ) values (
    v_org, v_prestamo, p_cuota_id, v_efectivo, v_mora, v_credito, v_excedente,
    now(), v_metodo, v_ref
  ) returning id into v_pago;

  if v_credito > 0 then
    insert into public.movimientos_credito (
      organizacion_id, cliente_id, tipo, monto, pago_id, prestamo_id, cuota_id, documento, nota
    ) values (
      v_org, v_cliente, 'uso', -v_credito, v_pago, v_prestamo, p_cuota_id, v_documento,
      'Pago de la cuota #' || v_cuota.numero
    );
  end if;

  if v_excedente > 0 then
    insert into public.movimientos_credito (
      organizacion_id, cliente_id, tipo, monto, pago_id, prestamo_id, cuota_id, documento,
      metodo, referencia, nota
    ) values (
      v_org, v_cliente, 'excedente', v_excedente, v_pago, v_prestamo, p_cuota_id, v_documento,
      v_metodo, v_ref, 'Excedente del abono a la cuota #' || v_cuota.numero
    );
  end if;

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
$$;

-- ---------------------------------------------------------------------
-- 5. Pago de factura: acepta excedente y saldo a favor
-- ---------------------------------------------------------------------
drop function if exists public.registrar_pago_factura(uuid, numeric, text, text);

create or replace function public.registrar_pago_factura(
  p_factura_id uuid,
  p_monto      numeric,
  p_metodo     text,
  p_referencia text default null,
  p_credito    numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid := public.org_actual();
  v_fac       public.facturas;
  v_efectivo  numeric := round(coalesce(p_monto, 0), 2);
  v_credito   numeric := round(coalesce(p_credito, 0), 2);
  v_entregado numeric;
  v_aplicado  numeric;
  v_excedente numeric;
  v_saldo     numeric;
  v_pagado    numeric;
  v_pendiente numeric;
  v_metodo    text;
  v_ref       text := nullif(trim(coalesce(p_referencia, '')), '');
  v_pago      uuid;
begin
  select * into v_fac from public.facturas
  where id = p_factura_id and organizacion_id = v_org
  for update;

  if not found then
    raise exception 'Factura no encontrada';
  end if;
  if v_efectivo < 0 then
    raise exception 'El efectivo recibido no puede ser negativo';
  end if;
  if v_credito < 0 then
    raise exception 'El saldo a favor usado no puede ser negativo';
  end if;

  v_entregado := round(v_efectivo + v_credito, 2);
  if v_entregado <= 0 then
    raise exception 'El monto del pago debe ser mayor que cero';
  end if;
  if v_fac.saldo_pendiente <= 0 then
    raise exception 'Esta factura ya está pagada. Si el cliente quiere dejar dinero a su favor, regístralo como anticipo en su ficha.';
  end if;

  v_aplicado  := least(v_entregado, v_fac.saldo_pendiente);
  v_excedente := round(v_entregado - v_aplicado, 2);

  if (v_excedente > 0 or v_credito > 0) and v_fac.cliente_id is null then
    raise exception 'La factura no tiene cliente: no se puede guardar ni usar saldo a favor.';
  end if;

  if v_credito > 0 then
    if v_excedente > 0 then
      raise exception 'Con saldo a favor no puede sobrar dinero: usa sólo lo que falta para cubrir la factura (%).',
        public.pesos(v_fac.saldo_pendiente - v_efectivo);
    end if;

    perform 1 from public.clientes where id = v_fac.cliente_id and organizacion_id = v_org for update;
    v_saldo := public.saldo_credito(v_fac.cliente_id);
    if v_credito > v_saldo then
      raise exception 'El cliente sólo tiene % de saldo a favor.', public.pesos(v_saldo);
    end if;
  end if;

  v_metodo := case when v_efectivo = 0 then 'saldo_a_favor' else coalesce(p_metodo, 'efectivo') end;

  insert into public.pagos (
    organizacion_id, factura_id, monto, credito_usado, excedente, fecha, metodo, referencia
  ) values (
    v_org, p_factura_id, v_efectivo, v_credito, v_excedente, now(), v_metodo, v_ref
  ) returning id into v_pago;

  if v_credito > 0 then
    insert into public.movimientos_credito (
      organizacion_id, cliente_id, tipo, monto, pago_id, factura_id, documento, nota
    ) values (
      v_org, v_fac.cliente_id, 'uso', -v_credito, v_pago, p_factura_id, v_fac.numero,
      'Pago de la factura ' || v_fac.numero
    );
  end if;

  if v_excedente > 0 then
    insert into public.movimientos_credito (
      organizacion_id, cliente_id, tipo, monto, pago_id, factura_id, documento,
      metodo, referencia, nota
    ) values (
      v_org, v_fac.cliente_id, 'excedente', v_excedente, v_pago, p_factura_id, v_fac.numero,
      v_metodo, v_ref, 'Excedente del pago de la factura ' || v_fac.numero
    );
  end if;

  v_pagado    := round(v_fac.monto_pagado + v_aplicado, 2);
  v_pendiente := round(v_fac.total - v_pagado, 2);

  update public.facturas set
    monto_pagado    = v_pagado,
    saldo_pendiente = v_pendiente,
    estado          = case when v_pendiente <= 0 then 'pagada'
                           when v_pagado > 0 then 'parcial'
                           else 'pendiente' end
  where id = p_factura_id;

  return public.obtener_factura(p_factura_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Saldar el préstamo: con efectivo de más o con saldo a favor
-- ---------------------------------------------------------------------
-- `p_recibido` es el efectivo entregado (por defecto, justo lo que falta
-- tras el saldo usado). Si pasa del total, el resto queda a favor.
drop function if exists public.saldar_prestamo(uuid, numeric, text, text);

create or replace function public.saldar_prestamo(
  p_prestamo_id    uuid,
  p_monto_esperado numeric,
  p_metodo         text,
  p_referencia     text default null,
  p_recibido       numeric default null,
  p_credito        numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org        uuid := public.org_actual();
  v_cliente    uuid;
  v_documento  text;
  v_total      numeric;
  v_credito    numeric := round(coalesce(p_credito, 0), 2);
  v_efectivo   numeric;
  v_excedente  numeric;
  v_quedan     numeric;
  v_saldo      numeric;
  v_resta      numeric;
  v_mora       numeric;
  v_necesita   numeric;
  v_con_saldo  numeric;
  v_metodo     text;
  v_ref        text := nullif(trim(coalesce(p_referencia, '')), '');
  v_cuota      public.cuotas;
  v_pago       uuid;
  v_ultimo     uuid;
  v_num_ultima integer;
  v_cuota_ult  uuid;
begin
  if v_org is null then
    raise exception 'Usuario sin organización asignada';
  end if;

  select cliente_id, 'PRE-' || upper(left(id::text, 8))
    into v_cliente, v_documento
    from public.prestamos
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
    raise exception 'El total para saldar cambió: ahora es %. Revisa la cifra y confirma de nuevo.',
      public.pesos(v_total);
  end if;

  if v_credito < 0 then
    raise exception 'El saldo a favor usado no puede ser negativo';
  end if;

  v_efectivo := round(coalesce(p_recibido, v_total - v_credito), 2);
  if v_efectivo < 0 then
    raise exception 'El efectivo recibido no puede ser negativo';
  end if;
  if v_efectivo + v_credito < v_total then
    raise exception 'Para saldar faltan %.', public.pesos(v_total - v_efectivo - v_credito);
  end if;

  v_excedente := round(v_efectivo + v_credito - v_total, 2);

  if v_credito > 0 then
    if v_excedente > 0 then
      raise exception 'Con saldo a favor no puede sobrar dinero: usa sólo lo que falta para saldar (%).',
        public.pesos(v_total - v_efectivo);
    end if;

    perform 1 from public.clientes where id = v_cliente and organizacion_id = v_org for update;
    v_saldo := public.saldo_credito(v_cliente);
    if v_credito > v_saldo then
      raise exception 'El cliente sólo tiene % de saldo a favor.', public.pesos(v_saldo);
    end if;
  end if;

  v_metodo := case when v_efectivo = 0 then 'saldo_a_favor' else coalesce(p_metodo, 'efectivo') end;
  v_quedan := v_credito;

  -- Un pago por cada cuota que se liquida, igual que un abono normal; el
  -- saldo a favor se gasta en las primeras.
  for v_cuota in
    select * from public.cuotas
     where prestamo_id = p_prestamo_id
     order by numero
     for update
  loop
    v_resta := round(greatest(0, v_cuota.monto - v_cuota.monto_pagado), 2);
    v_mora  := round(greatest(0, v_cuota.mora_acumulada - v_cuota.mora_pagada), 2);
    v_necesita := round(v_resta + v_mora, 2);

    continue when v_necesita <= 0;

    v_con_saldo := least(v_quedan, v_necesita);
    v_quedan    := round(v_quedan - v_con_saldo, 2);

    insert into public.pagos (
      organizacion_id, prestamo_id, cuota_id, monto, monto_mora, credito_usado,
      fecha, metodo, referencia, saldo_de_prestamo
    ) values (
      v_org, p_prestamo_id, v_cuota.id, round(v_necesita - v_con_saldo, 2), v_mora, v_con_saldo,
      now(), v_metodo, v_ref, true
    ) returning id into v_pago;

    if v_con_saldo > 0 then
      insert into public.movimientos_credito (
        organizacion_id, cliente_id, tipo, monto, pago_id, prestamo_id, cuota_id, documento, nota
      ) values (
        v_org, v_cliente, 'uso', -v_con_saldo, v_pago, p_prestamo_id, v_cuota.id, v_documento,
        'Saldo del préstamo, cuota #' || v_cuota.numero
      );
    end if;

    update public.cuotas set
      monto_pagado = monto,
      mora_pagada  = mora_acumulada,
      estado       = 'pagada'
    where id = v_cuota.id;

    v_ultimo     := v_pago;
    v_cuota_ult  := v_cuota.id;
    v_num_ultima := v_cuota.numero;
  end loop;

  -- Lo que sobró del efectivo viaja en el último pago y queda a favor
  if v_excedente > 0 then
    update public.pagos set
      monto     = round(monto + v_excedente, 2),
      excedente = v_excedente
    where id = v_ultimo;

    insert into public.movimientos_credito (
      organizacion_id, cliente_id, tipo, monto, pago_id, prestamo_id, cuota_id, documento,
      metodo, referencia, nota
    ) values (
      v_org, v_cliente, 'excedente', v_excedente, v_ultimo, p_prestamo_id, v_cuota_ult, v_documento,
      v_metodo, v_ref, 'Excedente al saldar el préstamo'
    );
  end if;

  perform public.recalcular_estado_prestamo(p_prestamo_id);

  return public.obtener_prestamo(p_prestamo_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Anticipo y devolución
-- ---------------------------------------------------------------------
create or replace function public.registrar_anticipo(
  p_cliente_id uuid,
  p_monto      numeric,
  p_metodo     text,
  p_referencia text default null,
  p_nota       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := public.org_actual();
  v_monto  numeric := round(coalesce(p_monto, 0), 2);
  v_activo boolean;
  v_mov    public.movimientos_credito;
begin
  select activo into v_activo from public.clientes
  where id = p_cliente_id and organizacion_id = v_org
  for update;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;
  if not v_activo then
    raise exception 'El cliente está desactivado';
  end if;
  if v_monto <= 0 then
    raise exception 'El anticipo debe ser mayor que cero';
  end if;
  if v_monto > 999999999 then
    raise exception 'El anticipo supera el máximo permitido';
  end if;
  if coalesce(p_metodo, 'efectivo') not in ('efectivo', 'transferencia', 'tarjeta', 'otro') then
    raise exception 'Método de pago inválido: %', p_metodo;
  end if;

  insert into public.movimientos_credito (
    organizacion_id, cliente_id, tipo, monto, metodo, referencia, nota
  ) values (
    v_org, p_cliente_id, 'anticipo', v_monto, coalesce(p_metodo, 'efectivo'),
    nullif(trim(coalesce(p_referencia, '')), ''), nullif(trim(coalesce(p_nota, '')), '')
  ) returning * into v_mov;

  return to_jsonb(v_mov);
end;
$$;

create or replace function public.devolver_saldo(
  p_cliente_id uuid,
  p_monto      numeric,
  p_metodo     text,
  p_referencia text default null,
  p_nota       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := public.org_actual();
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_saldo numeric;
  v_mov   public.movimientos_credito;
begin
  perform 1 from public.clientes
  where id = p_cliente_id and organizacion_id = v_org
  for update;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;
  if v_monto <= 0 then
    raise exception 'La devolución debe ser mayor que cero';
  end if;
  if coalesce(p_metodo, 'efectivo') not in ('efectivo', 'transferencia', 'tarjeta', 'otro') then
    raise exception 'Método de pago inválido: %', p_metodo;
  end if;

  v_saldo := public.saldo_credito(p_cliente_id);
  if v_monto > v_saldo then
    raise exception 'El cliente sólo tiene % de saldo a favor.', public.pesos(v_saldo);
  end if;

  insert into public.movimientos_credito (
    organizacion_id, cliente_id, tipo, monto, metodo, referencia, nota
  ) values (
    v_org, p_cliente_id, 'devolucion', -v_monto, coalesce(p_metodo, 'efectivo'),
    nullif(trim(coalesce(p_referencia, '')), ''), nullif(trim(coalesce(p_nota, '')), '')
  ) returning * into v_mov;

  return to_jsonb(v_mov);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Borrar un préstamo o una factura borra también su rastro de saldo
-- ---------------------------------------------------------------------
-- Borrar un documento ya elimina sus pagos; con el saldo a favor pasa lo
-- mismo: el que se usó en él vuelve al cliente y el excedente que generó
-- se anula. Si ese excedente ya se gastó o se devolvió, el saldo quedaría
-- en negativo, así que el borrado se detiene.
create or replace function public.anular_credito_de_documento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r       record;
  v_saldo numeric;
  v_doc   text;
begin
  -- Si se está borrando la organización entera, sus movimientos se van con ella
  if not exists (select 1 from public.organizaciones where id = old.organizacion_id) then
    return old;
  end if;

  if tg_table_name = 'prestamos' then
    v_doc := 'PRE-' || upper(left(old.id::text, 8));
  else
    v_doc := old.numero;
  end if;

  for r in
    select cliente_id, organizacion_id, round(sum(monto), 2) as neto
      from public.movimientos_credito
     where (tg_table_name = 'prestamos' and prestamo_id = old.id)
        or (tg_table_name = 'facturas'  and factura_id  = old.id)
     group by cliente_id, organizacion_id
    having round(sum(monto), 2) <> 0
  loop
    perform 1 from public.clientes where id = r.cliente_id for update;

    select coalesce(round(sum(monto), 2), 0) into v_saldo
      from public.movimientos_credito
     where cliente_id = r.cliente_id;

    if round(v_saldo - r.neto, 2) < 0 then
      raise exception 'No se puede eliminar %: generó % de saldo a favor que el cliente ya usó o se le devolvió.',
        v_doc, public.pesos(r.neto);
    end if;

    insert into public.movimientos_credito (organizacion_id, cliente_id, tipo, monto, documento, nota)
    values (r.organizacion_id, r.cliente_id, 'anulacion', -r.neto, v_doc, 'Se eliminó ' || v_doc);
  end loop;

  return old;
end;
$$;

drop trigger if exists trg_anular_credito on public.prestamos;
create trigger trg_anular_credito
  before delete on public.prestamos
  for each row execute function public.anular_credito_de_documento();

drop trigger if exists trg_anular_credito on public.facturas;
create trigger trg_anular_credito
  before delete on public.facturas
  for each row execute function public.anular_credito_de_documento();

-- ---------------------------------------------------------------------
-- 9. Un cliente con saldo a favor no se borra ni se desactiva
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
    'prestamos',    (select count(*) from public.prestamos    where cliente_id = p_cliente_id and organizacion_id = public.org_actual()),
    'movimientos_credito', (select count(*) from public.movimientos_credito where cliente_id = p_cliente_id and organizacion_id = public.org_actual()),
    'saldo_a_favor', public.saldo_credito(p_cliente_id)
  );
$$;

-- Si el cliente tiene historial se da de baja lógica (se conserva la
-- trazabilidad fiscal); si no tiene nada, se borra de verdad. Con saldo a
-- favor no se hace ninguna de las dos: ese dinero es del cliente.
create or replace function public.eliminar_cliente(p_cliente_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := public.org_actual();
  v_hist  jsonb;
  v_saldo numeric;
begin
  perform 1 from public.clientes where id = p_cliente_id and organizacion_id = v_org for update;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  v_saldo := public.saldo_credito(p_cliente_id);
  if v_saldo <> 0 then
    raise exception 'No se puede eliminar: el cliente tiene % de saldo a favor. Úsalo en una deuda o devuélveselo primero.',
      public.pesos(v_saldo);
  end if;

  v_hist := public.contar_historial_cliente(p_cliente_id);
  if (v_hist->>'cotizaciones')::int + (v_hist->>'facturas')::int + (v_hist->>'prestamos')::int
     + (v_hist->>'movimientos_credito')::int > 0 then
    update public.clientes set activo = false where id = p_cliente_id and organizacion_id = v_org;
    return 'desactivado';
  end if;

  delete from public.clientes where id = p_cliente_id and organizacion_id = v_org;
  return 'eliminado';
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Permisos: sólo usuarios autenticados
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.saldo_credito(uuid)',
    'public.registrar_pago_cuota(uuid, numeric, text, text, numeric, numeric)',
    'public.registrar_pago_factura(uuid, numeric, text, text, numeric)',
    'public.saldar_prestamo(uuid, numeric, text, text, numeric, numeric)',
    'public.registrar_anticipo(uuid, numeric, text, text, text)',
    'public.devolver_saldo(uuid, numeric, text, text, text)',
    'public.contar_historial_cliente(uuid)',
    'public.eliminar_cliente(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke all on function public.anular_credito_de_documento() from public, anon, authenticated;
revoke all on function public.pesos(numeric) from public, anon;
grant execute on function public.pesos(numeric) to authenticated;
