import React from 'react';
import type { AppState, TabType, Factura, Cotizacion } from '../types';
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
  onOpenNewQuote: () => void;
  onOpenNewInvoice: () => void;
  onOpenNewLoan: () => void;
  onOpenNewClient: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onNavigateTab,
  onOpenNewQuote,
  onOpenNewInvoice,
  onOpenNewLoan,
  onOpenNewClient,
}) => {
  const totalPorCobrar = state.facturas.reduce((acc: number, fac: Factura) => {
    return acc + (fac.saldo_pendiente || 0);
  }, 0);

  const cotizacionesActivas = state.cotizaciones.filter(
    (c: Cotizacion) => c.estado === 'borrador' || c.estado === 'enviada'
  );

  const prestamosActivos = state.prestamos.filter((p) => p.estado === 'activo');
  let cuotasAtrasadasCount = 0;
  state.prestamos.forEach((p) => {
    p.cuotas?.forEach((c) => {
      if (c.estado === 'atrasada') cuotasAtrasadasCount++;
    });
  });

  return (
    <div className="space-y-8 pb-12 font-sans">
      {/* Top Banner Hero */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 uppercase tracking-wider">
            <TrendingUp className="w-5 h-5 text-emerald-600" /> Panel Operativo
          </div>
          <h2 className="text-3xl font-bold text-slate-800">
            {state.settings.business_name || 'Resumen General'}
          </h2>
          <p className="text-sm text-slate-500">
            Control de cuentas por cobrar, cotizaciones y préstamos en RD$.
          </p>
        </div>
      </div>

      {/* Metric Cards Grid - Maximum 2 Colors: Slate Neutral & Emerald Accent */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div
          onClick={() => onNavigateTab('documentos')}
          className="bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-6 cursor-pointer transition-colors shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-slate-500 uppercase">Por Cobrar</span>
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 text-emerald-600 flex items-center justify-center">
                <Wallet className="w-6 h-6" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-800 mb-2">
              {formatCurrency(totalPorCobrar)}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500 pt-4 border-t border-slate-100">
            <span>
              {state.facturas.filter((f) => f.saldo_pendiente > 0).length} facturas pendientes
            </span>
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('documentos')}
          className="bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-6 cursor-pointer transition-colors shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-slate-500 uppercase">Cotizaciones</span>
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 text-emerald-600 flex items-center justify-center">
                <FileCheck className="w-6 h-6" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-800 mb-2">
              {cotizacionesActivas.length}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500 pt-4 border-t border-slate-100">
            <span>Activas por responder</span>
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('prestamos')}
          className="bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-6 cursor-pointer transition-colors shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-slate-500 uppercase">Préstamos</span>
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 text-emerald-600 flex items-center justify-center">
                <Landmark className="w-6 h-6" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-bold text-slate-800">
                {prestamosActivos.length}
              </span>
              <span className="text-sm text-slate-500">activos</span>
              {cuotasAtrasadasCount > 0 ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  <AlertTriangle className="w-4 h-4 text-emerald-600" /> {cuotasAtrasadasCount} atraso
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500 pt-4 border-t border-slate-100">
            <span>Gestión de cuotas</span>
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Quick Actions Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest font-heading">
          Acciones Rápidas
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <button
            onClick={onOpenNewQuote}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 hover:text-emerald-900 transition-all text-xs font-bold shadow-xs hover:scale-[1.02]"
          >
            <PlusCircle className="w-5 h-5 text-emerald-600" />
            <span>+ Cotización</span>
          </button>

          <button
            onClick={onOpenNewInvoice}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 hover:text-emerald-900 transition-all text-xs font-bold shadow-xs hover:scale-[1.02]"
          >
            <PlusCircle className="w-5 h-5 text-emerald-600" />
            <span>+ Factura</span>
          </button>

          <button
            onClick={onOpenNewLoan}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 hover:text-emerald-900 transition-all text-xs font-bold shadow-xs hover:scale-[1.02]"
          >
            <PlusCircle className="w-5 h-5 text-emerald-600" />
            <span>+ Préstamo</span>
          </button>

          <button
            onClick={onOpenNewClient}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 hover:text-emerald-900 transition-all text-xs font-bold shadow-xs hover:scale-[1.02]"
          >
            <PlusCircle className="w-5 h-5 text-emerald-600" />
            <span>+ Cliente</span>
          </button>
        </div>
      </div>

      {/* Recent Invoices Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2 font-heading">
            <FileText className="w-4 h-4 text-emerald-600" /> Últimas Facturas Emitidas
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
            {state.facturas.slice(0, 4).map((fac: Factura) => {
              const cli = state.clientes.find((c) => c.id === fac.cliente_id);
              return (
                <div
                  key={fac.id}
                  onClick={() => onNavigateTab('documentos')}
                  className="py-4 flex items-center justify-between hover:bg-slate-50 px-3 rounded-2xl cursor-pointer transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm font-heading">{fac.numero}</span>
                      {fac.estado === 'pagada' ? (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          PAGADA
                        </span>
                      ) : null}
                      {fac.estado === 'parcial' ? (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                          PARCIAL
                        </span>
                      ) : null}
                      {fac.estado === 'pendiente' ? (
                        <span className="text-[10px] font-bold text-red-800 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
                          PENDIENTE
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500 truncate max-w-[180px] font-medium">
                      {cli?.nombre || 'Cliente sin asignar'}
                    </p>
                  </div>

                  <div className="text-right">
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
