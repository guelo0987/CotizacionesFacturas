import React from 'react';
import type { BusinessSettings, Cliente, Pago, Prestamo } from '../../types';
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
import { METODOS_PAGO, referenciaPrestamo } from '../../utils/documentosPrestamo';
import { aCuotaDePago } from '../../utils/creditos';

interface Props {
  id: string;
  prestamo: Prestamo;
  /** Los pagos que generó el saldo: uno por cada cuota liquidada. */
  pagos: Pago[];
  cliente?: Cliente;
  settings: BusinessSettings;
  /** Saldo a favor que le quedó al cliente; `null` si nunca ha tenido. */
  saldoAFavor?: number | null;
}

/** Cifras del recibo de saldo, reunidas a partir de sus pagos. */
function resumen(prestamo: Prestamo, pagos: Pago[]) {
  const numeroDe = new Map((prestamo.cuotas ?? []).map((c) => [c.id, c.numero]));

  const lineas = pagos
    .map((p) => ({
      numero: numeroDe.get(p.cuota_id ?? '') ?? 0,
      aCuota: aCuotaDePago(p),
      mora: redondearDinero(p.monto_mora || 0),
    }))
    .sort((a, b) => a.numero - b.numero);

  const totalCuotas = redondearDinero(lineas.reduce((s, l) => s + l.aCuota, 0));
  const totalMora = redondearDinero(lineas.reduce((s, l) => s + l.mora, 0));
  const efectivo = redondearDinero(pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0));
  const credito = redondearDinero(pagos.reduce((s, p) => s + (Number(p.credito_usado) || 0), 0));
  const excedente = redondearDinero(pagos.reduce((s, p) => s + (Number(p.excedente) || 0), 0));
  const primero = pagos[0];

  return {
    lineas,
    totalCuotas,
    totalMora,
    total: redondearDinero(totalCuotas + totalMora),
    efectivo,
    credito,
    excedente,
    // Sin efectivo, lo que se destaca es lo pagado con su saldo
    montoDestacado: efectivo > 0 ? efectivo : credito,
    tituloMonto: efectivo > 0 ? 'Monto recibido para saldar el préstamo' : 'Saldado con su saldo a favor',
    fecha: primero?.fecha ?? '',
    metodo: primero ? METODOS_PAGO[primero.metodo] ?? primero.metodo : '',
    referencia: primero?.referencia ?? null,
  };
}

/** Referencia del saldo: el inicio del id del préstamo, que sólo se salda una vez. */
function referenciaSaldo(prestamo: Prestamo): string {
  return `SAL-${prestamo.id.slice(0, 8).toUpperCase()}`;
}

// =====================================================================
// Hoja A4
// =====================================================================

export const ReciboSaldoA4: React.FC<Props> = ({
  id,
  prestamo,
  pagos,
  cliente,
  settings,
  saldoAFavor = null,
}) => {
  const r = resumen(prestamo, pagos);

  // Compacto a propósito: un préstamo de muchas cuotas saldado temprano
  // lista varias filas, y el recibo tiene que seguir cabiendo en una hoja.
  return (
    <div
      id={id}
      className="documento-a4 bg-white text-slate-900 p-8 rounded-lg shadow-sm font-sans mx-auto space-y-4"
    >
      <div className="flex justify-between items-start border-b border-slate-200 pb-5 gap-4">
        <DatosNegocioA4 settings={settings} />

        <TituloDocumentoA4 titulo="RECIBO DE SALDO" numero={referenciaSaldo(prestamo)}>
          <div className="text-xs text-slate-600">
            Fecha: <span className="font-semibold">{formatDate(r.fecha)}</span>
          </div>
          <div className="text-xs text-slate-600">
            Préstamo: <span className="font-semibold font-mono">{referenciaPrestamo(prestamo)}</span>
          </div>
        </TituloDocumentoA4>
      </div>

      <div className="grid grid-cols-2 gap-4">
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

        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center flex flex-col justify-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            {r.tituloMonto}
          </div>
          <div className="text-3xl font-black text-emerald-700 mt-1">
            {formatCurrency(r.montoDestacado)}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {r.metodo}
            {r.referencia ? ` · Ref: ${r.referencia}` : ''}
          </div>
          {r.efectivo > 0 && r.credito > 0 ? (
            <div className="text-xs text-sky-800 mt-1">
              + Saldo a favor: <strong>{formatCurrency(r.credito)}</strong>
            </div>
          ) : null}
        </div>
      </div>

      {/* Qué se liquidó: el cliente tiene que ver cuota por cuota qué pagó */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          Cuotas liquidadas
        </div>
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white font-bold uppercase text-[10px]">
              <th className="p-2 rounded-l">Cuota</th>
              <th className="p-2 text-right">A la cuota</th>
              {r.totalMora > 0 ? <th className="p-2 text-right">Mora</th> : null}
              <th className="p-2 text-right rounded-r">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {r.lineas.map((l) => (
              <tr key={l.numero}>
                <td className="px-2 py-1.5 text-slate-700">
                  #{l.numero} de {prestamo.num_cuotas}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-700">{formatCurrency(l.aCuota)}</td>
                {r.totalMora > 0 ? (
                  <td className="px-2 py-1.5 text-right text-amber-800">
                    {l.mora > 0 ? formatCurrency(l.mora) : '—'}
                  </td>
                ) : null}
                <td className="px-2 py-1.5 text-right font-bold text-slate-900">
                  {formatCurrency(redondearDinero(l.aCuota + l.mora))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end break-inside-avoid">
        <div className="w-72 space-y-1.5 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="flex justify-between text-slate-700">
            <span>Cuotas e intereses:</span>
            <span className="font-semibold">{formatCurrency(r.totalCuotas)}</span>
          </div>
          {r.totalMora > 0 ? (
            <div className="flex justify-between text-amber-900">
              <span>Mora:</span>
              <span className="font-semibold">{formatCurrency(r.totalMora)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-300">
            <span>TOTAL PAGADO:</span>
            <span className="text-emerald-700">{formatCurrency(r.total)}</span>
          </div>
          {r.excedente > 0 ? (
            <div className="flex justify-between text-sky-900">
              <span>Entregó de más, queda a su favor:</span>
              <span className="font-semibold">{formatCurrency(r.excedente)}</span>
            </div>
          ) : null}
          <div className="text-center font-bold text-emerald-800 bg-emerald-100 p-1.5 rounded mt-1">
            PRÉSTAMO SALDADO POR COMPLETO · SALDO RD$0.00
          </div>
          {saldoAFavor !== null ? (
            <div className="flex justify-between text-sky-900 font-bold bg-sky-50 border border-sky-200 p-1.5 rounded">
              <span>Su saldo a favor:</span>
              <span>{formatCurrency(saldoAFavor)}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 pt-8 text-[10px] text-slate-500 break-inside-avoid">
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

export const ReciboSaldoTermico: React.FC<Props & { formato: FormatoImpresion }> = ({
  id,
  prestamo,
  pagos,
  cliente,
  settings,
  formato,
  saldoAFavor = null,
}) => {
  const estrecho = formato === '58mm';
  const monto = (valor: number) => montoTermico(formatCurrency(valor), estrecho);
  const titulo = estrecho ? 'text-[12px]' : 'text-[14px]';
  const grande = estrecho ? 'text-[15px]' : 'text-[18px]';
  const r = resumen(prestamo, pagos);

  return (
    <HojaTermica id={id} formato={formato}>
      <CabeceraTermica settings={settings} estrecho={estrecho} />

      <Separador />

      <div className="text-center space-y-0.5">
        <div className={`${titulo} font-bold uppercase`}>Recibo de saldo</div>
        <div className="font-bold">{referenciaSaldo(prestamo)}</div>
        <div>Fecha: {formatDate(r.fecha)}</div>
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

      <div className="text-center py-1">
        <div className="font-bold uppercase">{r.efectivo > 0 ? 'Monto recibido' : 'Con su saldo a favor'}</div>
        <div className={`${grande} font-bold tabular-nums`}>{formatCurrency(r.montoDestacado)}</div>
        <div>{r.metodo}</div>
        {r.referencia ? <div className="break-words">Ref: {r.referencia}</div> : null}
        {r.efectivo > 0 && r.credito > 0 ? <div>+ Saldo a favor: {monto(r.credito)}</div> : null}
      </div>

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">Cuotas liquidadas</div>
        {r.lineas.map((l) => (
          <FilaTermica
            key={l.numero}
            etiqueta={`#${l.numero}${l.mora > 0 ? ' +mora' : ''}`}
            valor={monto(redondearDinero(l.aCuota + l.mora))}
          />
        ))}
      </div>

      <Separador />

      <div className="space-y-0.5">
        <FilaTermica etiqueta="Cuotas e intereses:" valor={monto(r.totalCuotas)} />
        {r.totalMora > 0 ? <FilaTermica etiqueta="Mora:" valor={monto(r.totalMora)} /> : null}
        <div className={`${titulo} font-bold flex justify-between gap-2 pt-1 border-t border-black`}>
          <span>TOTAL:</span>
          <span className="tabular-nums whitespace-nowrap">{formatCurrency(r.total)}</span>
        </div>
        {r.excedente > 0 ? (
          <FilaTermica etiqueta="Queda a su favor:" valor={monto(r.excedente)} fuerte />
        ) : null}
        <div className="text-center font-bold pt-1">PRÉSTAMO SALDADO</div>
        <div className="text-center">Saldo pendiente: {monto(0)}</div>
        {saldoAFavor !== null ? (
          <FilaTermica etiqueta="Su saldo a favor:" valor={monto(saldoAFavor)} fuerte />
        ) : null}
      </div>

      <Separador />

      <div className="text-center break-words">Conserve este recibo.</div>
      <div className="mt-6 border-t border-black pt-1 text-center">Firma del cliente</div>

      <PieTermico settings={settings} estrecho={estrecho} />
    </HojaTermica>
  );
};
