import React from 'react';
import type { BusinessSettings, Cliente, Cuota, Pago, Prestamo } from '../../types';
import { formatCurrency, formatDate, formatDocumento, formatTelefono } from '../../utils/sanitizer';
import { redondearDinero } from '../../utils/validacion';
import { moraPendiente, moraPendientePrestamo } from '../../utils/calculos';
import type { FormatoImpresion } from '../../utils/formatosImpresion';
import {
  CabeceraTermica,
  DatosNegocioA4,
  FilaTermica,
  HojaTermica,
  PieDocumentoA4,
  PieTermico,
  Separador,
  TituloDocumentoA4,
} from './piezas';
import { montoTermico } from '../../utils/formatoTermico';
import {
  METODOS_PAGO,
  estadoTrasPago,
  referenciaAbono,
  referenciaPrestamo,
} from '../../utils/documentosPrestamo';

interface Props {
  id: string;
  prestamo: Prestamo;
  cuota: Cuota;
  pago: Pago;
  cliente?: Cliente;
  settings: BusinessSettings;
}

/**
 * Cifras del recibo: cómo quedaron la cuota y el préstamo con este pago,
 * aunque se reimprima después de otros.
 */
function resumen(prestamo: Prestamo, cuota: Cuota, pago: Pago) {
  const estado = estadoTrasPago(prestamo, cuota, pago);
  const aMora = redondearDinero(pago.monto_mora || 0);

  return {
    ...estado,
    // El pago se reparte entre la mora y la cuota; el recibo tiene que
    // decir cuánto fue a cada cosa o el cliente no entiende por qué su
    // cuota bajó menos de lo que entregó.
    aMora,
    aCuota: redondearDinero(pago.monto - aMora),
    // De la mora sólo se sabe la de hoy: en la reimpresión de un abono
    // anterior se omite en vez de mezclar fechas.
    moraCuota: estado.esElUltimo ? moraPendiente(cuota) : 0,
    moraPrestamo: estado.esElUltimo ? moraPendientePrestamo(prestamo) : 0,
  };
}

// =====================================================================
// Hoja A4
// =====================================================================

export const ReciboAbonoA4: React.FC<Props> = ({
  id,
  prestamo,
  cuota,
  pago,
  cliente,
  settings,
}) => {
  const {
    abonadoCuota,
    restaCuota,
    abonadoTotal,
    saldoPrestamo,
    aMora,
    aCuota,
    moraCuota,
    moraPrestamo,
  } = resumen(prestamo, cuota, pago);

  return (
    <div
      id={id}
      className="documento-a4 bg-white text-slate-900 p-8 rounded-lg shadow-sm font-sans mx-auto space-y-6"
    >
      <div className="flex justify-between items-start border-b border-slate-200 pb-5 gap-4">
        <DatosNegocioA4 settings={settings} />

        <TituloDocumentoA4 titulo="RECIBO DE ABONO" numero={referenciaAbono(pago)}>
          <div className="text-xs text-slate-600">
            Fecha: <span className="font-semibold">{formatDate(pago.fecha)}</span>
          </div>
          <div className="text-xs text-slate-600">
            Préstamo: <span className="font-semibold font-mono">{referenciaPrestamo(prestamo)}</span>
          </div>
        </TituloDocumentoA4>
      </div>

      {/* Quién paga */}
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-1">
        <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
          Recibido de
        </div>
        <div className="text-sm font-bold text-slate-900">{cliente?.nombre || 'Cliente'}</div>
        {cliente?.documento ? (
          <div className="text-slate-700 font-mono">
            RNC/Cédula: {formatDocumento(cliente.documento)}
          </div>
        ) : null}
        {cliente?.telefono ? (
          <div className="text-slate-700">Teléfono: {formatTelefono(cliente.telefono)}</div>
        ) : null}
      </div>

      {/* El monto es lo que el cliente viene a comprobar: va grande */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 text-center">
        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
          Monto recibido
        </div>
        <div className="text-3xl font-black text-emerald-700 mt-1">
          {formatCurrency(pago.monto)}
        </div>
        <div className="text-xs text-slate-600 mt-1">
          {METODOS_PAGO[pago.metodo] ?? pago.metodo}
          {pago.referencia ? ` · Ref: ${pago.referencia}` : ''}
        </div>

        {aMora > 0 ? (
          <div className="flex justify-center gap-6 mt-3 pt-2 border-t border-emerald-200 text-xs">
            <span className="text-amber-900">
              A la mora: <strong>{formatCurrency(aMora)}</strong>
            </span>
            <span className="text-slate-700">
              A la cuota: <strong>{formatCurrency(aCuota)}</strong>
            </span>
          </div>
        ) : null}
      </div>

      {/* Aplicación del abono */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
            Cuota abonada
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Cuota:</span>
            <span className="font-bold text-slate-900">
              #{cuota.numero} de {prestamo.num_cuotas}
            </span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Vencimiento:</span>
            <span className="font-semibold">{formatDate(cuota.fecha_vencimiento)}</span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Monto de la cuota:</span>
            <span className="font-semibold">{formatCurrency(cuota.monto)}</span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Abonado a la cuota:</span>
            <span className="font-semibold text-emerald-700">
              {formatCurrency(abonadoCuota)}
            </span>
          </div>
          {moraCuota > 0 ? (
            <div className="flex justify-between text-amber-900 font-semibold">
              <span>Mora pendiente de la cuota:</span>
              <span>{formatCurrency(moraCuota)}</span>
            </div>
          ) : null}
          <div
            className={`flex justify-between font-bold p-1.5 rounded mt-1 ${
              restaCuota <= 0 ? 'text-emerald-800 bg-emerald-100' : 'text-amber-900 bg-amber-100'
            }`}
          >
            <span>{restaCuota <= 0 ? 'Cuota saldada' : 'Resta de la cuota:'}</span>
            <span>{restaCuota <= 0 ? '✓' : formatCurrency(restaCuota)}</span>
          </div>
        </div>

        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
            Estado del préstamo
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Total a pagar:</span>
            <span className="font-semibold">{formatCurrency(prestamo.total_a_pagar)}</span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Abonado en total:</span>
            <span className="font-semibold text-emerald-700">
              {formatCurrency(abonadoTotal)}
            </span>
          </div>
          {moraPrestamo > 0 ? (
            <div className="flex justify-between text-amber-900 font-semibold">
              <span>Mora pendiente:</span>
              <span>{formatCurrency(moraPrestamo)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-300">
            <span>SALDO:</span>
            <span className={saldoPrestamo <= 0 ? 'text-emerald-700' : 'text-amber-800'}>
              {formatCurrency(saldoPrestamo)}
            </span>
          </div>
          {saldoPrestamo <= 0 ? (
            <div className="text-[11px] font-bold text-emerald-800 bg-emerald-100 p-1.5 rounded text-center">
              PRÉSTAMO SALDADO POR COMPLETO
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 pt-10 text-[10px] text-slate-500">
        <div className="border-t border-slate-400 pt-1 text-center">Firma del cliente</div>
        <div className="border-t border-slate-400 pt-1 text-center">
          Recibí por {settings.business_name || 'el negocio'}
        </div>
      </div>

      <PieDocumentoA4 settings={settings} />
    </div>
  );
};

// =====================================================================
// Rollo térmico
// =====================================================================

export const ReciboAbonoTermico: React.FC<Props & { formato: FormatoImpresion }> = ({
  id,
  prestamo,
  cuota,
  pago,
  cliente,
  settings,
  formato,
}) => {
  const estrecho = formato === '58mm';
  const monto = (valor: number) => montoTermico(formatCurrency(valor), estrecho);
  const titulo = estrecho ? 'text-[12px]' : 'text-[14px]';
  const grande = estrecho ? 'text-[15px]' : 'text-[18px]';

  const {
    abonadoCuota,
    restaCuota,
    abonadoTotal,
    saldoPrestamo,
    aMora,
    aCuota,
    moraCuota,
    moraPrestamo,
  } = resumen(prestamo, cuota, pago);

  return (
    <HojaTermica id={id} formato={formato}>
      <CabeceraTermica settings={settings} estrecho={estrecho} />

      <Separador />

      <div className="text-center space-y-0.5">
        <div className={`${titulo} font-bold uppercase`}>Recibo de abono</div>
        <div className="font-bold">{referenciaAbono(pago)}</div>
        <div>Fecha: {formatDate(pago.fecha)}</div>
        <div>Préstamo: {referenciaPrestamo(prestamo)}</div>
      </div>

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">Recibido de</div>
        <div>{cliente?.nombre || 'Cliente'}</div>
        {cliente?.documento ? <div>RNC/Céd: {formatDocumento(cliente.documento)}</div> : null}
        {cliente?.telefono ? <div>Tel: {formatTelefono(cliente.telefono)}</div> : null}
      </div>

      <Separador />

      {/* El monto recibido es lo que el cliente mira: va grande y centrado */}
      <div className="text-center py-1">
        <div className="font-bold uppercase">Monto recibido</div>
        <div className={`${grande} font-bold tabular-nums`}>{formatCurrency(pago.monto)}</div>
        <div>{METODOS_PAGO[pago.metodo] ?? pago.metodo}</div>
        {pago.referencia ? <div className="break-words">Ref: {pago.referencia}</div> : null}
      </div>

      {aMora > 0 ? (
        <div className="space-y-0.5 pt-1 border-t border-dashed border-black">
          <FilaTermica etiqueta="A la mora:" valor={monto(aMora)} />
          <FilaTermica etiqueta="A la cuota:" valor={monto(aCuota)} />
        </div>
      ) : null}

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">
          Cuota #{cuota.numero} de {prestamo.num_cuotas}
        </div>
        <FilaTermica etiqueta="Vence:" valor={formatDate(cuota.fecha_vencimiento)} />
        <FilaTermica etiqueta="Monto cuota:" valor={monto(cuota.monto)} />
        <FilaTermica etiqueta="Abonado:" valor={monto(abonadoCuota)} />
        <FilaTermica
          etiqueta={restaCuota <= 0 ? 'Cuota:' : 'Resta cuota:'}
          valor={restaCuota <= 0 ? 'SALDADA' : monto(restaCuota)}
          fuerte
        />
        {moraCuota > 0 ? (
          <FilaTermica etiqueta="Mora de la cuota:" valor={monto(moraCuota)} fuerte />
        ) : null}
      </div>

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">Estado del préstamo</div>
        <FilaTermica etiqueta="Total a pagar:" valor={monto(prestamo.total_a_pagar)} />
        <FilaTermica etiqueta="Abonado total:" valor={monto(abonadoTotal)} />
        {moraPrestamo > 0 ? (
          <FilaTermica etiqueta="Mora pendiente:" valor={monto(moraPrestamo)} fuerte />
        ) : null}
        <div className={`${titulo} font-bold flex justify-between gap-2 pt-1 border-t border-black`}>
          <span>SALDO:</span>
          <span className="tabular-nums whitespace-nowrap">{formatCurrency(saldoPrestamo)}</span>
        </div>
        {saldoPrestamo <= 0 ? (
          <div className="text-center font-bold pt-1">PRÉSTAMO SALDADO</div>
        ) : null}
      </div>

      <Separador />

      <div className="text-center break-words">Conserve este recibo.</div>

      <div className="mt-6 border-t border-black pt-1 text-center">Firma del cliente</div>

      <PieTermico settings={settings} estrecho={estrecho} />
    </HojaTermica>
  );
};
