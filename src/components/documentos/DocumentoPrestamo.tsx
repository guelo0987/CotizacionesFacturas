import React from 'react';
import type { BusinessSettings, Cliente, Prestamo } from '../../types';
import { formatCurrency, formatDate, formatDocumento, formatTelefono } from '../../utils/sanitizer';
import {
  FRECUENCIAS,
  MODOS_MORA,
  frecuenciaSegura,
  modoMoraSeguro,
  moraPendiente,
  moraPendientePrestamo,
} from '../../utils/calculos';
import {
  descripcionInteres,
  referenciaPrestamo,
  totalAbonado,
} from '../../utils/documentosPrestamo';
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

interface Props {
  id: string;
  prestamo: Prestamo;
  cliente?: Cliente;
  settings: BusinessSettings;
}

// =====================================================================
// Hoja A4
// =====================================================================

export const ComprobantePrestamoA4: React.FC<Props> = ({ id, prestamo, cliente, settings }) => {
  const cuotas = prestamo.cuotas ?? [];
  const frecuencia = FRECUENCIAS[frecuenciaSegura(prestamo.frecuencia)];
  const abonado = totalAbonado(prestamo);

  return (
    <div
      id={id}
      className="documento-a4 bg-white text-slate-900 p-8 rounded-lg shadow-sm font-sans mx-auto space-y-6"
    >
      <div className="flex justify-between items-start border-b border-slate-200 pb-5 gap-4">
        <DatosNegocioA4 settings={settings} />

        <TituloDocumentoA4 titulo="COMPROBANTE DE PRÉSTAMO" numero={referenciaPrestamo(prestamo)}>
          <div className="text-xs text-slate-600">
            Fecha de inicio: <span className="font-semibold">{formatDate(prestamo.fecha_inicio)}</span>
          </div>
          <div className="text-xs text-slate-600">
            Estado: <span className="font-semibold uppercase">{prestamo.estado}</span>
          </div>
        </TituloDocumentoA4>
      </div>

      {/* Deudor */}
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-1">
        <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
          Cliente deudor
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
        {cliente?.direccion ? (
          <div className="text-slate-700">Dirección: {cliente.direccion}</div>
        ) : null}
      </div>

      {/* Condiciones */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
            Condiciones
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Capital prestado:</span>
            <span className="font-bold text-slate-900">
              {formatCurrency(prestamo.monto_prestado)}
            </span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Interés total:</span>
            <span className="font-semibold">{formatCurrency(prestamo.interes_total)}</span>
          </div>
          <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-300">
            <span>TOTAL A PAGAR:</span>
            <span className="text-emerald-700">{formatCurrency(prestamo.total_a_pagar)}</span>
          </div>
          <p className="text-[10px] text-slate-500 pt-1 leading-snug">
            {descripcionInteres(prestamo)}.
          </p>
        </div>

        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
            Forma de pago
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Cuotas:</span>
            <span className="font-semibold">
              {prestamo.num_cuotas} {frecuencia.plural}
            </span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span>Vencimiento:</span>
            <span className="font-semibold">{frecuencia.detalle}</span>
          </div>
          <div className="flex justify-between text-slate-700 pt-1.5 border-t border-slate-300">
            <span>Abonado a la fecha:</span>
            <span className="font-semibold text-emerald-700">{formatCurrency(abonado)}</span>
          </div>
          <div className="flex justify-between font-bold text-amber-900 bg-amber-100 p-1.5 rounded">
            <span>Resta por pagar:</span>
            <span>{formatCurrency(Math.max(0, prestamo.total_a_pagar - abonado))}</span>
          </div>
        </div>
      </div>

      {prestamo.mora_activa ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1">
          <div className="font-bold uppercase tracking-wider text-amber-900 text-[10px]">
            Mora por atraso
          </div>
          <div className="text-slate-700">
            {formatCurrency(prestamo.mora_diaria)} por cada día de atraso ·{' '}
            {MODOS_MORA[modoMoraSeguro(prestamo.mora_modo)].detalle}.
          </div>
          {moraPendientePrestamo(prestamo) > 0 ? (
            <div className="flex justify-between font-bold text-amber-900 pt-1 border-t border-amber-300">
              <span>Mora pendiente a la fecha:</span>
              <span>{formatCurrency(moraPendientePrestamo(prestamo))}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Calendario */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          Calendario de cuotas ({cuotas.length})
        </div>
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white font-bold uppercase text-[10px]">
              <th className="p-2 rounded-l">#</th>
              <th className="p-2">Vence</th>
              <th className="p-2 text-right">Cuota</th>
              <th className="p-2 text-right">Interés</th>
              <th className="p-2 text-right">Capital</th>
              <th className="p-2 text-right">Saldo</th>
              {prestamo.mora_activa ? <th className="p-2 text-right">Mora</th> : null}
              <th className="p-2 text-right rounded-r">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {cuotas.map((cuota) => (
              <tr key={cuota.id}>
                <td className="p-2 text-slate-700">{cuota.numero}</td>
                <td className="p-2 text-slate-700">{formatDate(cuota.fecha_vencimiento)}</td>
                <td className="p-2 text-right font-bold text-slate-900">
                  {formatCurrency(cuota.monto)}
                </td>
                <td className="p-2 text-right text-slate-600">{formatCurrency(cuota.interes)}</td>
                <td className="p-2 text-right text-slate-600">{formatCurrency(cuota.capital)}</td>
                <td className="p-2 text-right text-slate-600">
                  {formatCurrency(cuota.saldo_capital)}
                </td>
                {prestamo.mora_activa ? (
                  <td className="p-2 text-right font-bold text-amber-800">
                    {moraPendiente(cuota) > 0 ? formatCurrency(moraPendiente(cuota)) : '—'}
                  </td>
                ) : null}
                <td className="p-2 text-right uppercase text-[10px] font-bold text-slate-700">
                  {cuota.estado}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Firmas: el comprobante se entrega en mano */}
      <div className="grid grid-cols-2 gap-8 pt-10 text-[10px] text-slate-500">
        <div className="border-t border-slate-400 pt-1 text-center">
          Firma del cliente deudor
        </div>
        <div className="border-t border-slate-400 pt-1 text-center">
          Firma por {settings.business_name || 'el negocio'}
        </div>
      </div>

      <PieDocumentoA4 settings={settings} />
    </div>
  );
};

// =====================================================================
// Rollo térmico
// =====================================================================

export const ComprobantePrestamoTermico: React.FC<Props & { formato: FormatoImpresion }> = ({
  id,
  prestamo,
  cliente,
  settings,
  formato,
}) => {
  const estrecho = formato === '58mm';
  const monto = (valor: number) => montoTermico(formatCurrency(valor), estrecho);
  const titulo = estrecho ? 'text-[12px]' : 'text-[14px]';
  const total = estrecho ? 'text-[11px]' : 'text-[13px]';

  const cuotas = prestamo.cuotas ?? [];
  const frecuencia = FRECUENCIAS[frecuenciaSegura(prestamo.frecuencia)];
  const abonado = totalAbonado(prestamo);

  return (
    <HojaTermica id={id} formato={formato}>
      <CabeceraTermica settings={settings} estrecho={estrecho} />

      <Separador />

      <div className="text-center space-y-0.5">
        <div className={`${titulo} font-bold uppercase`}>Comprobante de préstamo</div>
        <div className="font-bold">{referenciaPrestamo(prestamo)}</div>
        <div>Inicio: {formatDate(prestamo.fecha_inicio)}</div>
      </div>

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">Cliente deudor</div>
        <div>{cliente?.nombre || 'Cliente'}</div>
        {cliente?.documento ? <div>RNC/Céd: {formatDocumento(cliente.documento)}</div> : null}
        {cliente?.telefono ? <div>Tel: {formatTelefono(cliente.telefono)}</div> : null}
      </div>

      <Separador />

      {/* Condiciones */}
      <div className="space-y-0.5">
        <FilaTermica etiqueta="Capital:" valor={monto(prestamo.monto_prestado)} />
        <FilaTermica etiqueta="Interés:" valor={monto(prestamo.interes_total)} />
        <div className={`${total} font-bold flex justify-between gap-2 pt-1 border-t border-black`}>
          <span>TOTAL:</span>
          <span className="tabular-nums whitespace-nowrap">
            {formatCurrency(prestamo.total_a_pagar)}
          </span>
        </div>
        <FilaTermica
          etiqueta="Cuotas:"
          valor={`${prestamo.num_cuotas} ${frecuencia.plural}`}
        />
        <FilaTermica etiqueta="Abonado:" valor={monto(abonado)} />
        <FilaTermica
          etiqueta="Resta:"
          valor={monto(Math.max(0, prestamo.total_a_pagar - abonado))}
          fuerte
        />
        <div className="pt-1 break-words">{descripcionInteres(prestamo)}.</div>
        {prestamo.mora_activa ? (
          <div className="pt-1 break-words font-bold">
            Mora: {monto(prestamo.mora_diaria)} por cada día de atraso.
          </div>
        ) : null}
        {moraPendientePrestamo(prestamo) > 0 ? (
          <FilaTermica
            etiqueta="Mora pendiente:"
            valor={monto(moraPendientePrestamo(prestamo))}
            fuerte
          />
        ) : null}
      </div>

      <Separador />

      {/* Calendario: una línea por cuota */}
      <div className="space-y-0.5">
        <div className="font-bold uppercase">Calendario de cuotas</div>
        {cuotas.map((cuota) => (
          <div key={cuota.id} className="flex justify-between gap-1">
            <span className="whitespace-nowrap">
              {String(cuota.numero).padStart(2, '0')} {formatDate(cuota.fecha_vencimiento)}
            </span>
            <span className="tabular-nums whitespace-nowrap">
              {monto(cuota.monto)}
              {moraPendiente(cuota) > 0 ? `+${monto(moraPendiente(cuota))}` : ''}
              {cuota.estado === 'pagada' ? ' OK' : ''}
            </span>
          </div>
        ))}
      </div>

      <Separador />

      <div className="text-center break-words">Conserve este comprobante.</div>

      {/* Firma: el comprobante se entrega en mano */}
      <div className="mt-6 border-t border-black pt-1 text-center">Firma del cliente</div>

      <PieTermico settings={settings} estrecho={estrecho} />
    </HojaTermica>
  );
};
