import React, { useMemo, useState } from 'react';
import type { AppState } from '../types';
import { formatCurrency, formatDate } from '../utils/sanitizer';
import { formatearDocumento, formatearTelefono, redondearDinero } from '../utils/validacion';
import { descargarCSV, generarCSV, nombreConFecha } from '../utils/exportar';
import { FRECUENCIAS, frecuenciaSegura, modalidadSegura } from '../utils/calculos';
import { useFeedback } from './feedback/contexto';
import { Download, FileSpreadsheet, X } from 'lucide-react';

interface ReportesModalProps {
  state: AppState;
  onClose: () => void;
}

const primerDiaDelMes = () => {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
};

const hoyISO = () => new Date().toISOString().split('T')[0];

/** Compara sólo la parte de fecha, sin zona horaria. */
const dentroDelRango = (fecha: string | null | undefined, desde: string, hasta: string) => {
  if (!fecha) return false;
  const dia = fecha.split('T')[0];
  return dia >= desde && dia <= hasta;
};

export const ReportesModal: React.FC<ReportesModalProps> = ({ state, onClose }) => {
  const { exito, error: avisarError } = useFeedback();
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoyISO());

  const nombreCliente = (id: string) =>
    state.clientes.find((c) => c.id === id)?.nombre ?? 'Cliente sin asignar';

  const datos = useMemo(() => {
    const facturas = state.facturas.filter((f) => dentroDelRango(f.fecha, desde, hasta));
    const cotizaciones = state.cotizaciones.filter((c) => dentroDelRango(c.fecha, desde, hasta));
    const pagos = state.pagos.filter((p) => dentroDelRango(p.fecha, desde, hasta));

    const facturado = redondearDinero(facturas.reduce((a, f) => a + f.total, 0));
    const itbisFacturado = redondearDinero(facturas.reduce((a, f) => a + f.itbis, 0));
    const cobrado = redondearDinero(pagos.reduce((a, p) => a + p.monto, 0));
    const porCobrar = redondearDinero(
      state.facturas.reduce((a, f) => a + (f.saldo_pendiente || 0), 0)
    );

    const cobradoFacturas = redondearDinero(
      pagos.filter((p) => p.factura_id).reduce((a, p) => a + p.monto, 0)
    );
    const cobradoPrestamos = redondearDinero(
      pagos.filter((p) => p.prestamo_id).reduce((a, p) => a + p.monto, 0)
    );

    return {
      facturas,
      cotizaciones,
      pagos,
      facturado,
      itbisFacturado,
      cobrado,
      cobradoFacturas,
      cobradoPrestamos,
      porCobrar,
    };
  }, [state, desde, hasta]);

  const exportar = (tipo: 'facturas' | 'pagos' | 'clientes' | 'prestamos' | 'itbis') => {
    try {
      let csv = '';
      let nombre = '';

      if (tipo === 'facturas') {
        nombre = 'facturas';
        csv = generarCSV(
          ['Número', 'NCF', 'Fecha', 'Cliente', 'Estado', 'Subtotal', 'ITBIS', 'Total', 'Pagado', 'Saldo'],
          datos.facturas.map((f) => [
            f.numero,
            f.ncf ?? '',
            formatDate(f.fecha),
            nombreCliente(f.cliente_id),
            f.estado,
            f.subtotal,
            f.itbis,
            f.total,
            f.monto_pagado,
            f.saldo_pendiente,
          ])
        );
      } else if (tipo === 'pagos') {
        nombre = 'pagos_recibidos';
        csv = generarCSV(
          ['Fecha', 'Origen', 'Documento', 'Cliente', 'Método', 'Referencia', 'Monto'],
          datos.pagos.map((p) => {
            const factura = state.facturas.find((f) => f.id === p.factura_id);
            const prestamo = state.prestamos.find((pr) => pr.id === p.prestamo_id);
            return [
              formatDate(p.fecha),
              p.factura_id ? 'Factura' : 'Préstamo',
              factura?.numero ?? (prestamo ? `Préstamo ${formatCurrency(prestamo.monto_prestado)}` : ''),
              nombreCliente(factura?.cliente_id ?? prestamo?.cliente_id ?? ''),
              p.metodo,
              p.referencia ?? '',
              p.monto,
            ];
          })
        );
      } else if (tipo === 'clientes') {
        nombre = 'clientes';
        csv = generarCSV(
          ['Nombre', 'RNC/Cédula', 'Teléfono', 'Correo', 'Dirección', 'Estado', 'Deuda pendiente'],
          state.clientes.map((c) => [
            c.nombre,
            formatearDocumento(c.documento),
            formatearTelefono(c.telefono),
            c.email ?? '',
            c.direccion ?? '',
            c.activo ? 'Activo' : 'Desactivado',
            redondearDinero(
              state.facturas
                .filter((f) => f.cliente_id === c.id)
                .reduce((a, f) => a + (f.saldo_pendiente || 0), 0)
            ),
          ])
        );
      } else if (tipo === 'prestamos') {
        nombre = 'prestamos';
        csv = generarCSV(
          [
            'Cliente', 'Fecha inicio', 'Prestado', 'Tasa %', 'Cobro del interés',
            'Interés', 'Total a pagar', 'Cuotas', 'Frecuencia', 'Estado', 'Cobrado',
            'Pendiente', 'Cuotas atrasadas',
          ],
          state.prestamos.map((p) => {
            const cobrado = redondearDinero(
              (p.cuotas ?? []).reduce((a, c) => a + (c.monto_pagado || 0), 0)
            );
            return [
              nombreCliente(p.cliente_id),
              formatDate(p.fecha_inicio),
              p.monto_prestado,
              p.tasa_interes,
              // Sin esta columna un «10%» en el reporte sería ambiguo: puede
              // ser 10% por cuota o 10% una sola vez sobre el capital.
              modalidadSegura(p.modalidad_interes) === 'por_periodo'
                ? `Por cuota (${FRECUENCIAS[frecuenciaSegura(p.frecuencia)].adjetivo})`
                : 'Único sobre el capital',
              p.interes_total,
              p.total_a_pagar,
              p.num_cuotas,
              p.frecuencia,
              p.estado,
              cobrado,
              redondearDinero(p.total_a_pagar - cobrado),
              (p.cuotas ?? []).filter((c) => c.estado === 'atrasada').length,
            ];
          })
        );
      } else {
        // Resumen de ITBIS facturado, base para el reporte 607 de la DGII
        nombre = 'itbis_ventas';
        csv = generarCSV(
          ['RNC/Cédula cliente', 'Tipo comprobante', 'NCF', 'Fecha', 'Monto facturado', 'ITBIS facturado'],
          datos.facturas.map((f) => {
            const cli = state.clientes.find((c) => c.id === f.cliente_id);
            return [
              cli?.documento ?? '',
              f.ncf ? f.ncf.slice(1, 3) : '',
              f.ncf ?? '',
              formatDate(f.fecha),
              f.subtotal,
              f.itbis,
            ];
          })
        );
      }

      descargarCSV(nombreConFecha(nombre), csv);
      exito('Archivo descargado.');
    } catch (e) {
      avisarError(e instanceof Error ? e.message : 'No se pudo generar el archivo.');
    }
  };

  const botones: { id: Parameters<typeof exportar>[0]; etiqueta: string; detalle: string }[] = [
    { id: 'facturas', etiqueta: 'Facturas del período', detalle: `${datos.facturas.length} documentos` },
    { id: 'pagos', etiqueta: 'Pagos recibidos', detalle: `${datos.pagos.length} cobros` },
    { id: 'itbis', etiqueta: 'ITBIS en ventas (607)', detalle: 'Base para la DGII' },
    { id: 'clientes', etiqueta: 'Directorio de clientes', detalle: `${state.clientes.length} clientes` },
    { id: 'prestamos', etiqueta: 'Cartera de préstamos', detalle: `${state.prestamos.length} préstamos` },
  ];

  const rangoInvalido = desde > hasta;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto font-sans">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] flex flex-col my-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 font-heading">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Reportes y exportación
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Cerrar reportes"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto pr-1 flex-1 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rep-desde" className="block text-sm font-bold text-slate-700 mb-1">
                Desde
              </label>
              <input
                id="rep-desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="rep-hasta" className="block text-sm font-bold text-slate-700 mb-1">
                Hasta
              </label>
              <input
                id="rep-hasta"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {rangoInvalido ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              La fecha inicial no puede ser posterior a la final.
            </p>
          ) : null}

          {/* Resumen del período */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Resumen del período
            </h4>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="block text-[11px] text-slate-500">Facturado</span>
                <span className="font-black text-slate-900">{formatCurrency(datos.facturado)}</span>
              </div>
              <div>
                <span className="block text-[11px] text-slate-500">ITBIS facturado</span>
                <span className="font-bold text-slate-700">
                  {formatCurrency(datos.itbisFacturado)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-slate-500">Cobrado</span>
                <span className="font-black text-emerald-700">{formatCurrency(datos.cobrado)}</span>
              </div>
              <div>
                <span className="block text-[11px] text-slate-500">Por cobrar (total)</span>
                <span className="font-bold text-amber-800">{formatCurrency(datos.porCobrar)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-3 text-xs text-slate-600">
              <div>
                De facturas:{' '}
                <span className="font-semibold text-slate-800">
                  {formatCurrency(datos.cobradoFacturas)}
                </span>
              </div>
              <div>
                De préstamos:{' '}
                <span className="font-semibold text-slate-800">
                  {formatCurrency(datos.cobradoPrestamos)}
                </span>
              </div>
              <div>
                Facturas emitidas:{' '}
                <span className="font-semibold text-slate-800">{datos.facturas.length}</span>
              </div>
              <div>
                Cotizaciones:{' '}
                <span className="font-semibold text-slate-800">{datos.cotizaciones.length}</span>
              </div>
            </div>
          </div>

          {/* Descargas */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Descargar en Excel (CSV)
            </h4>

            {botones.map((b) => (
              <button
                key={b.id}
                onClick={() => exportar(b.id)}
                disabled={rangoInvalido}
                className="w-full flex items-center justify-between gap-3 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
              >
                <div className="min-w-0">
                  <span className="block text-sm font-bold text-slate-800">{b.etiqueta}</span>
                  <span className="block text-xs text-slate-500">{b.detalle}</span>
                </div>
                <Download className="w-4 h-4 text-emerald-600 shrink-0" />
              </button>
            ))}

            <p className="text-xs text-slate-500 pt-1 leading-relaxed">
              Los archivos de clientes y préstamos incluyen todos los registros; el resto se limita
              al período seleccionado. Se abren directamente en Excel con las tildes correctas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
