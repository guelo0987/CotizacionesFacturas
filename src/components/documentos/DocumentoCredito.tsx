import React from 'react';
import type { BusinessSettings, Cliente, MovimientoCredito } from '../../types';
import { formatCurrency, formatDate, formatDocumento, formatTelefono } from '../../utils/sanitizer';
import { redondearDinero } from '../../utils/validacion';
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
import { METODOS_PAGO } from '../../utils/documentosPrestamo';
import { referenciaMovimiento } from '../../utils/creditos';

interface Props {
  id: string;
  /** Un anticipo o una devolución. */
  movimiento: MovimientoCredito;
  /** Saldo a favor que le quedó al cliente con este movimiento. */
  saldoDespues: number;
  cliente?: Cliente;
  settings: BusinessSettings;
}

/** Textos que cambian entre el recibo de un anticipo y el de una devolución. */
function textos(mov: MovimientoCredito, saldoDespues: number) {
  const esDevolucion = mov.tipo === 'devolucion';
  const monto = redondearDinero(Math.abs(Number(mov.monto) || 0));
  return {
    esDevolucion,
    monto,
    saldoAntes: redondearDinero(saldoDespues - (Number(mov.monto) || 0)),
    titulo: esDevolucion ? 'DEVOLUCIÓN DE SALDO' : 'RECIBO DE ANTICIPO',
    persona: esDevolucion ? 'Entregado a' : 'Recibido de',
    etiquetaMonto: esDevolucion ? 'Monto devuelto' : 'Monto recibido',
    movimiento: esDevolucion ? 'Devolución:' : 'Anticipo:',
    explicacion: esDevolucion
      ? 'El cliente recibe este monto de su saldo a favor.'
      : 'Este monto queda a favor del cliente y se usará en sus próximas cuotas o facturas cuando así se indique al cobrar.',
    firmaNegocio: esDevolucion ? 'Entregué por' : 'Recibí por',
    metodo: mov.metodo ? METODOS_PAGO[mov.metodo] ?? mov.metodo : '',
  };
}

// =====================================================================
// Hoja A4
// =====================================================================

export const ComprobanteCreditoA4: React.FC<Props> = ({ id, movimiento, saldoDespues, cliente, settings }) => {
  const t = textos(movimiento, saldoDespues);

  return (
    <div
      id={id}
      className="documento-a4 bg-white text-slate-900 p-8 rounded-lg shadow-sm font-sans mx-auto space-y-6"
    >
      <div className="flex justify-between items-start border-b border-slate-200 pb-5 gap-4">
        <DatosNegocioA4 settings={settings} />

        <TituloDocumentoA4 titulo={t.titulo} numero={referenciaMovimiento(movimiento)}>
          <div className="text-xs text-slate-600">
            Fecha: <span className="font-semibold">{formatDate(movimiento.fecha)}</span>
          </div>
        </TituloDocumentoA4>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-1">
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">{t.persona}</div>
          <div className="text-sm font-bold text-slate-900">{cliente?.nombre || 'Cliente'}</div>
          {cliente?.documento ? (
            <div className="text-slate-700 font-mono">RNC/Cédula: {formatDocumento(cliente.documento)}</div>
          ) : null}
          {cliente?.telefono ? (
            <div className="text-slate-700">Teléfono: {formatTelefono(cliente.telefono)}</div>
          ) : null}
        </div>

        <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 text-center flex flex-col justify-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-800">{t.etiquetaMonto}</div>
          <div className="text-3xl font-black text-sky-800 mt-1">{formatCurrency(t.monto)}</div>
          <div className="text-xs text-slate-600 mt-1">
            {t.metodo}
            {movimiento.referencia ? ` · Ref: ${movimiento.referencia}` : ''}
          </div>
        </div>
      </div>

      <div className="flex justify-end break-inside-avoid">
        <div className="w-72 space-y-1.5 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">Saldo a favor</div>
          <div className="flex justify-between text-slate-700">
            <span>Saldo anterior:</span>
            <span className="font-semibold">{formatCurrency(t.saldoAntes)}</span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span>{t.movimiento}</span>
            <span className="font-semibold">
              {t.esDevolucion ? '−' : '+'} {formatCurrency(t.monto)}
            </span>
          </div>
          <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-300">
            <span>SALDO A FAVOR:</span>
            <span className="text-sky-800">{formatCurrency(saldoDespues)}</span>
          </div>
        </div>
      </div>

      <div className="text-xs text-slate-600 space-y-1">
        <p>{t.explicacion}</p>
        {movimiento.nota ? <p className="italic">Nota: {movimiento.nota}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-8 pt-8 text-[10px] text-slate-500 break-inside-avoid">
        <div className="border-t border-slate-400 pt-1 text-center">Firma del cliente</div>
        <div className="border-t border-slate-400 pt-1 text-center">
          {t.firmaNegocio} {settings.business_name || 'el negocio'}
        </div>
      </div>

      <PieDocumentoA4 settings={settings} />
    </div>
  );
};

// =====================================================================
// Rollo térmico
// =====================================================================

export const ComprobanteCreditoTermico: React.FC<Props & { formato: FormatoImpresion }> = ({
  id,
  movimiento,
  saldoDespues,
  cliente,
  settings,
  formato,
}) => {
  const estrecho = formato === '58mm';
  const monto = (valor: number) => montoTermico(formatCurrency(valor), estrecho);
  const titulo = estrecho ? 'text-[12px]' : 'text-[14px]';
  const grande = estrecho ? 'text-[15px]' : 'text-[18px]';
  const t = textos(movimiento, saldoDespues);

  return (
    <HojaTermica id={id} formato={formato}>
      <CabeceraTermica settings={settings} estrecho={estrecho} />

      <Separador />

      <div className="text-center space-y-0.5">
        <div className={`${titulo} font-bold uppercase`}>{t.titulo}</div>
        <div className="font-bold">{referenciaMovimiento(movimiento)}</div>
        <div>Fecha: {formatDate(movimiento.fecha)}</div>
      </div>

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">{t.persona}</div>
        <div>{cliente?.nombre || 'Cliente'}</div>
        {cliente?.documento ? <div>RNC/Céd: {formatDocumento(cliente.documento)}</div> : null}
        {cliente?.telefono ? <div>Tel: {formatTelefono(cliente.telefono)}</div> : null}
      </div>

      <Separador />

      <div className="text-center py-1">
        <div className="font-bold uppercase">{t.etiquetaMonto}</div>
        <div className={`${grande} font-bold tabular-nums`}>{formatCurrency(t.monto)}</div>
        <div>{t.metodo}</div>
        {movimiento.referencia ? <div className="break-words">Ref: {movimiento.referencia}</div> : null}
      </div>

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">Saldo a favor</div>
        <FilaTermica etiqueta="Anterior:" valor={monto(t.saldoAntes)} />
        <FilaTermica
          etiqueta={t.movimiento}
          valor={`${t.esDevolucion ? '−' : '+'}${monto(t.monto)}`}
        />
        <div className={`${titulo} font-bold flex justify-between gap-2 pt-1 border-t border-black`}>
          <span>SALDO:</span>
          <span className="tabular-nums whitespace-nowrap">{formatCurrency(saldoDespues)}</span>
        </div>
      </div>

      <Separador />

      <div className="text-center break-words">{t.explicacion}</div>
      {movimiento.nota ? <div className="text-center break-words">Nota: {movimiento.nota}</div> : null}
      <div className="mt-6 border-t border-black pt-1 text-center">Firma del cliente</div>

      <PieTermico settings={settings} estrecho={estrecho} />
    </HojaTermica>
  );
};
