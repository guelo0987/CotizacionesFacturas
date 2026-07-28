import React, { useMemo } from 'react';
import type { AppState, TabType } from '../types';
import type { SolicitudApertura } from '../App';
import { formatCurrency } from '../utils/sanitizer';
import {
  Wallet,
  FileCheck,
  Landmark,
  PlusCircle,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  FileText,
  CheckCircle2,
} from 'lucide-react';

interface DashboardViewProps {
  state: AppState;
  onNavigateTab: (tab: TabType) => void;
  onAbrirFormulario: (destino: SolicitudApertura['destino']) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onNavigateTab,
  onAbrirFormulario,
}) => {
  const metricas = useMemo(() => {
    const totalPorCobrar = state.facturas.reduce((acc, f) => acc + (f.saldo_pendiente || 0), 0);
    const facturasPendientes = state.facturas.filter((f) => f.saldo_pendiente > 0).length;

    const cotizacionesActivas = state.cotizaciones.filter(
      (c) => c.estado === 'borrador' || c.estado === 'enviada'
    ).length;

    const prestamosActivos = state.prestamos.filter(
      (p) => p.estado === 'activo' || p.estado === 'atrasado'
    ).length;

    // El estado 'atrasada' lo asigna el servidor al cargar la aplicación.
    // Antes nadie lo asignaba nunca y este contador se quedaba en cero.
    let cuotasAtrasadas = 0;
    let montoAtrasado = 0;
    state.prestamos.forEach((p) => {
      p.cuotas?.forEach((c) => {
        if (c.estado === 'atrasada') {
          cuotasAtrasadas++;
          montoAtrasado += Math.max(0, c.monto - (c.monto_pagado || 0));
        }
      });
    });

    return {
      totalPorCobrar,
      facturasPendientes,
      cotizacionesActivas,
      prestamosActivos,
      cuotasAtrasadas,
      montoAtrasado,
    };
  }, [state.facturas, state.cotizaciones, state.prestamos]);

  const acciones: { etiqueta: string; destino: SolicitudApertura['destino'] }[] = [
    { etiqueta: 'Cotización', destino: 'cotizacion' },
    { etiqueta: 'Factura', destino: 'factura' },
    { etiqueta: 'Préstamo', destino: 'prestamo' },
    { etiqueta: 'Cliente', destino: 'cliente' },
  ];

  return (
    <div className="space-y-8 pb-12 font-sans">
      <div className="tour-dashboard-hero bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 uppercase tracking-wider">
            <TrendingUp className="w-5 h-5 text-emerald-600" /> Panel operativo
          </div>
          <h2 className="text-3xl font-bold text-slate-800">
            {state.settings.business_name || 'Resumen general'}
          </h2>
          <p className="text-sm text-slate-500">
            Control de cuentas por cobrar, cotizaciones y préstamos en {state.settings.currency}.
          </p>
        </div>
      </div>

      {/* Aviso de morosidad: sólo aparece cuando hay algo que atender */}
      {metricas.cuotasAtrasadas > 0 ? (
        <button
          onClick={() => onNavigateTab('prestamos')}
          className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 hover:bg-amber-100 transition-colors"
        >
          <div className="w-11 h-11 rounded-xl bg-white border border-amber-200 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">
              {metricas.cuotasAtrasadas}{' '}
              {metricas.cuotasAtrasadas === 1 ? 'cuota atrasada' : 'cuotas atrasadas'}
            </p>
            <p className="text-xs text-amber-800">
              {formatCurrency(metricas.montoAtrasado)} pendientes de cobro vencido.
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-700 shrink-0" />
        </button>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <button
          onClick={() => onNavigateTab('documentos')}
          className="text-left bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-6 transition-colors shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-slate-500 uppercase">Por cobrar</span>
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 text-emerald-600 flex items-center justify-center">
                <Wallet className="w-6 h-6" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-800 mb-2">
              {formatCurrency(metricas.totalPorCobrar)}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500 pt-4 border-t border-slate-100">
            <span>
              {metricas.facturasPendientes}{' '}
              {metricas.facturasPendientes === 1 ? 'factura pendiente' : 'facturas pendientes'}
            </span>
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('documentos')}
          className="text-left bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-6 transition-colors shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-slate-500 uppercase">Cotizaciones</span>
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 text-emerald-600 flex items-center justify-center">
                <FileCheck className="w-6 h-6" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-800 mb-2">
              {metricas.cotizacionesActivas}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500 pt-4 border-t border-slate-100">
            <span>Activas por responder</span>
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('prestamos')}
          className="text-left bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-6 transition-colors shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-slate-500 uppercase">Préstamos</span>
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 text-emerald-600 flex items-center justify-center">
                <Landmark className="w-6 h-6" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-bold text-slate-800">{metricas.prestamosActivos}</span>
              <span className="text-sm text-slate-500">vigentes</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500 pt-4 border-t border-slate-100">
            <span>Gestión de cuotas</span>
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </div>
        </button>
      </div>

      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest font-heading">
          Acciones rápidas
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {acciones.map((accion) => (
            <button
              key={accion.destino}
              onClick={() => onAbrirFormulario(accion.destino)}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 hover:text-emerald-900 transition-all text-xs font-bold shadow-xs hover:scale-[1.02]"
            >
              <PlusCircle className="w-5 h-5 text-emerald-600" />
              <span>+ {accion.etiqueta}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2 font-heading">
            <FileText className="w-4 h-4 text-emerald-600" /> Últimas facturas emitidas
          </h3>
          <button
            onClick={() => onNavigateTab('documentos')}
            className="text-xs text-emerald-700 hover:text-emerald-800 font-bold transition-colors"
          >
            Ver todas
          </button>
        </div>

        {state.facturas.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs font-medium">
            No hay facturas registradas aún.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {state.facturas.slice(0, 4).map((fac) => {
              const cli = state.clientes.find((c) => c.id === fac.cliente_id);
              return (
                <button
                  key={fac.id}
                  onClick={() => onNavigateTab('documentos')}
                  className="w-full text-left py-4 flex items-center justify-between hover:bg-slate-50 px-3 rounded-2xl transition-all"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm font-heading">
                        {fac.numero}
                      </span>
                      {fac.estado === 'pagada' ? (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          PAGADA
                        </span>
                      ) : fac.estado === 'parcial' ? (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                          PARCIAL
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-red-800 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
                          PENDIENTE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate max-w-[180px] font-medium">
                      {cli?.nombre || 'Cliente sin asignar'}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-extrabold text-slate-900 font-heading">
                      {formatCurrency(fac.total)}
                    </div>
                    {fac.saldo_pendiente > 0 ? (
                      <div className="text-[11px] text-amber-700 font-semibold">
                        Resta: {formatCurrency(fac.saldo_pendiente)}
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-700 font-semibold flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Saldada
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
