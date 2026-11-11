import React from 'react';
import type { BusinessSettings } from '../../types';
import { formatCurrency } from '../../utils/sanitizer';
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
import { fechaLarga, horaDe, type Cuadre } from '../../utils/cuadre';

interface Props {
  id: string;
  cuadre: Cuadre;
  settings: BusinessSettings;
}

/** Momento en que se generó el cuadre, para saber si es un corte parcial. */
function generadoAhora(): string {
  return new Intl.DateTimeFormat('es-DO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

const metodoDe = (metodo: string | null) => (metodo ? METODOS_PAGO[metodo] ?? metodo : '—');

// =====================================================================
// Hoja A4
// =====================================================================

export const CuadreA4: React.FC<Props> = ({ id, cuadre, settings }) => {
  const { entradas, salidas } = cuadre;

  return (
    <div
      id={id}
      className="documento-a4 bg-white text-slate-900 p-8 rounded-lg shadow-sm font-sans mx-auto space-y-5"
    >
      <div className="flex justify-between items-start border-b border-slate-200 pb-5 gap-4">
        <DatosNegocioA4 settings={settings} />
        <TituloDocumentoA4 titulo="CUADRE DEL DÍA" numero={fechaLarga(cuadre.dia)}>
          <div className="text-xs text-slate-600">Generado: {generadoAhora()}</div>
        </TituloDocumentoA4>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Total recogido</div>
          <div className="text-3xl font-black text-emerald-700 mt-1">{formatCurrency(entradas.total)}</div>
          <div className="text-xs text-slate-600 mt-1">
            {cuadre.cobros} {cuadre.cobros === 1 ? 'cobro' : 'cobros'}
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center flex flex-col justify-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Neto del día</div>
          <div className={`text-xl font-black mt-1 ${cuadre.neto < 0 ? 'text-amber-800' : 'text-slate-900'}`}>
            {formatCurrency(cuadre.neto)}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">entradas − salidas</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs break-inside-avoid">
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">Entradas</div>
          <Fila etiqueta="Cuotas de préstamos" valor={entradas.prestamos} />
          {entradas.mora > 0 ? <Fila etiqueta="   de eso, mora" valor={entradas.mora} tenue /> : null}
          <Fila etiqueta="Pagos de facturas" valor={entradas.facturas} />
          <Fila etiqueta="Anticipos" valor={entradas.anticipos} />
          <Fila etiqueta="Total" valor={entradas.total} fuerte />
        </div>
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">Salidas</div>
          <Fila etiqueta="Préstamos entregados" valor={salidas.prestamosEntregados} />
          <Fila etiqueta="Devoluciones de saldo" valor={salidas.devoluciones} />
          <Fila etiqueta="Total" valor={salidas.total} fuerte />
        </div>
      </div>

      <div className="break-inside-avoid">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Por método de pago</div>
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white font-bold uppercase text-[10px]">
              <th className="p-2 rounded-l">Método</th>
              <th className="p-2 text-right">Entradas</th>
              <th className="p-2 text-right">Salidas</th>
              <th className="p-2 text-right rounded-r">Neto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {cuadre.porMetodo.map((f) => (
              <tr key={f.metodo}>
                <td className="px-2 py-1.5 text-slate-700">{metodoDe(f.metodo)}</td>
                <td className="px-2 py-1.5 text-right">{formatCurrency(f.entradas)}</td>
                <td className="px-2 py-1.5 text-right">{formatCurrency(f.salidas)}</td>
                <td className="px-2 py-1.5 text-right font-bold">{formatCurrency(f.neto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
          {salidas.prestamosEntregados > 0 ? (
            <p>
              Los préstamos entregados ({formatCurrency(salidas.prestamosEntregados)}) no registran método: si
              salieron en efectivo, réstalos del efectivo en caja.
            </p>
          ) : null}
          {cuadre.creditoUsado > 0 ? (
            <p>
              Además se pagaron {formatCurrency(cuadre.creditoUsado)} con saldo a favor de clientes: no es dinero
              nuevo y no está en el total.
            </p>
          ) : null}
          {cuadre.excedentes > 0 ? (
            <p>
              El total incluye {formatCurrency(cuadre.excedentes)} que los clientes dieron de más y quedaron a su
              favor.
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Detalle</div>
        {cuadre.renglones.length === 0 ? (
          <p className="text-xs text-slate-500 italic">Sin movimientos de dinero este día.</p>
        ) : (
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white font-bold uppercase text-[10px]">
                <th className="p-2 rounded-l">Hora</th>
                <th className="p-2">Cliente · concepto</th>
                <th className="p-2">Método</th>
                <th className="p-2 text-right">Entrada</th>
                <th className="p-2 text-right rounded-r">Salida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cuadre.renglones.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{horaDe(r.fecha)}</td>
                  <td className="px-2 py-1.5">
                    <div className="font-semibold text-slate-800">{r.cliente}</div>
                    <div className="text-[10px] text-slate-500">
                      {r.concepto}
                      {r.mora > 0 ? ` · mora ${formatCurrency(r.mora)}` : ''}
                      {r.creditoUsado > 0 ? ` · con saldo a favor ${formatCurrency(r.creditoUsado)}` : ''}
                      {r.excedente > 0 ? ` · quedó a favor ${formatCurrency(r.excedente)}` : ''}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{metodoDe(r.metodo)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-emerald-700">
                    {r.entrada > 0 ? formatCurrency(r.entrada) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-amber-800">
                    {r.salida > 0 ? formatCurrency(r.salida) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs grid grid-cols-3 gap-2 break-inside-avoid">
        <Actividad etiqueta="Cotizaciones" cantidad={cuadre.actividad.cotizaciones.cantidad} monto={cuadre.actividad.cotizaciones.total} />
        <Actividad etiqueta="Facturas" cantidad={cuadre.actividad.facturas.cantidad} monto={cuadre.actividad.facturas.total} />
        <Actividad etiqueta="Préstamos nuevos" cantidad={cuadre.actividad.prestamos.cantidad} monto={cuadre.actividad.prestamos.monto} />
      </div>

      <div className="grid grid-cols-2 gap-8 pt-8 text-[10px] text-slate-500 break-inside-avoid">
        <div className="border-t border-slate-400 pt-1 text-center">Entregado por</div>
        <div className="border-t border-slate-400 pt-1 text-center">Recibido por</div>
      </div>

      <PieDocumentoA4 settings={settings} />
    </div>
  );
};

const Fila: React.FC<{ etiqueta: string; valor: number; fuerte?: boolean; tenue?: boolean }> = ({
  etiqueta,
  valor,
  fuerte,
  tenue,
}) => (
  <div
    className={`flex justify-between ${
      fuerte ? 'font-black text-slate-900 pt-1.5 border-t border-slate-300' : tenue ? 'text-slate-500 pl-3' : 'text-slate-700'
    }`}
  >
    <span>{etiqueta.trim()}:</span>
    <span className={fuerte ? '' : 'font-semibold'}>{formatCurrency(valor)}</span>
  </div>
);

const Actividad: React.FC<{ etiqueta: string; cantidad: number; monto: number }> = ({ etiqueta, cantidad, monto }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{etiqueta}</div>
    <div className="font-bold text-slate-800">
      {cantidad} · {formatCurrency(monto)}
    </div>
  </div>
);

// =====================================================================
// Rollo térmico
// =====================================================================

export const CuadreTermico: React.FC<Props & { formato: FormatoImpresion }> = ({
  id,
  cuadre,
  settings,
  formato,
}) => {
  const estrecho = formato === '58mm';
  const monto = (valor: number) => montoTermico(formatCurrency(valor), estrecho);
  const titulo = estrecho ? 'text-[12px]' : 'text-[14px]';
  const grande = estrecho ? 'text-[15px]' : 'text-[18px]';
  const { entradas, salidas } = cuadre;

  return (
    <HojaTermica id={id} formato={formato}>
      <CabeceraTermica settings={settings} estrecho={estrecho} />

      <Separador />

      <div className="text-center space-y-0.5">
        <div className={`${titulo} font-bold uppercase`}>Cuadre del día</div>
        <div className="font-bold break-words">{fechaLarga(cuadre.dia)}</div>
        <div>Generado: {generadoAhora()}</div>
      </div>

      <Separador />

      <div className="text-center py-1">
        <div className="font-bold uppercase">Total recogido</div>
        <div className={`${grande} font-bold tabular-nums`}>{formatCurrency(entradas.total)}</div>
        <div>
          {cuadre.cobros} {cuadre.cobros === 1 ? 'cobro' : 'cobros'}
        </div>
      </div>

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">Entradas</div>
        <FilaTermica etiqueta="Cuotas:" valor={monto(entradas.prestamos)} />
        {entradas.mora > 0 ? <FilaTermica etiqueta=" de eso, mora:" valor={monto(entradas.mora)} /> : null}
        <FilaTermica etiqueta="Facturas:" valor={monto(entradas.facturas)} />
        <FilaTermica etiqueta="Anticipos:" valor={monto(entradas.anticipos)} />
        <FilaTermica etiqueta="Total entradas:" valor={monto(entradas.total)} fuerte />
      </div>

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">Salidas</div>
        <FilaTermica etiqueta="Préstamos entregados:" valor={monto(salidas.prestamosEntregados)} />
        <FilaTermica etiqueta="Devoluciones:" valor={monto(salidas.devoluciones)} />
        <FilaTermica etiqueta="Total salidas:" valor={monto(salidas.total)} fuerte />
        <div className={`${titulo} font-bold flex justify-between gap-2 pt-1 border-t border-black`}>
          <span>NETO:</span>
          <span className="tabular-nums whitespace-nowrap">{formatCurrency(cuadre.neto)}</span>
        </div>
      </div>

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">Por método</div>
        {cuadre.porMetodo.map((f) => (
          <FilaTermica key={f.metodo} etiqueta={`${metodoDe(f.metodo)}:`} valor={monto(f.neto)} />
        ))}
        {cuadre.creditoUsado > 0 ? (
          <div className="break-words">
            Con saldo a favor (no es dinero nuevo): {monto(cuadre.creditoUsado)}
          </div>
        ) : null}
        {salidas.prestamosEntregados > 0 ? (
          <div className="break-words">Préstamos entregados sin método: réstalos si fueron en efectivo.</div>
        ) : null}
      </div>

      <Separador />

      <div className="space-y-1">
        <div className="font-bold uppercase">Detalle</div>
        {cuadre.renglones.length === 0 ? (
          <div>Sin movimientos de dinero.</div>
        ) : (
          cuadre.renglones.map((r) => (
            <div key={r.id}>
              <div className="flex justify-between gap-2">
                <span className="break-words min-w-0">
                  {horaDe(r.fecha)} {r.cliente}
                </span>
                <span className="tabular-nums whitespace-nowrap font-bold">
                  {r.entrada > 0 ? monto(r.entrada) : r.salida > 0 ? `−${monto(r.salida)}` : monto(0)}
                </span>
              </div>
              <div className="break-words">
                {r.concepto} · {metodoDe(r.metodo)}
                {r.creditoUsado > 0 ? ` · saldo ${monto(r.creditoUsado)}` : ''}
              </div>
            </div>
          ))
        )}
      </div>

      <Separador />

      <div className="space-y-0.5">
        <div className="font-bold uppercase">Actividad</div>
        <FilaTermica
          etiqueta={`Cotizaciones (${cuadre.actividad.cotizaciones.cantidad}):`}
          valor={monto(cuadre.actividad.cotizaciones.total)}
        />
        <FilaTermica
          etiqueta={`Facturas (${cuadre.actividad.facturas.cantidad}):`}
          valor={monto(cuadre.actividad.facturas.total)}
        />
        <FilaTermica
          etiqueta={`Préstamos (${cuadre.actividad.prestamos.cantidad}):`}
          valor={monto(cuadre.actividad.prestamos.monto)}
        />
      </div>

      <div className="mt-6 border-t border-black pt-1 text-center">Entregado por</div>
      <div className="mt-6 border-t border-black pt-1 text-center">Recibido por</div>

      <PieTermico settings={settings} estrecho={estrecho} />
    </HojaTermica>
  );
};
