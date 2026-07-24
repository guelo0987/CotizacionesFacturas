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
    <div className="space-y-6 pb-8 font-sans">
      {/* Top Banner Hero */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-widest font-heading">
            <TrendingUp className="w-4 h-4 text-emerald-600" /> Panel Operativo
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-heading">
            {state.settings.business_name || 'Resumen General'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Control de cuentas por cobrar, cotizaciones y préstamos en RD$.
          </p>
        </div>
      </div>

      {/* Metric Cards Grid - Maximum 2 Colors: Slate Neutral & Emerald Accent */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div
          onClick={() => onNavigateTab('documentos')}
          className="bg-white border border-slate-200/90 hover:border-emerald-500/40 rounded-3xl p-6 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md group hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Por Cobrar</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2 font-heading">
            {formatCurrency(totalPorCobrar)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
            <span>
              {state.facturas.filter((f) => f.saldo_pendiente > 0).length} facturas pendientes
            </span>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('documentos')}
          className="bg-white border border-slate-200/90 hover:border-emerald-500/40 rounded-3xl p-6 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md group hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cotizaciones</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2 font-heading">
            {cotizacionesActivas.length}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
            <span>Activas por responder</span>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('prestamos')}
          className="bg-white border border-slate-200/90 hover:border-emerald-500/40 rounded-3xl p-6 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md group hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Préstamos</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-heading">
              {prestamosActivos.length}
            </span>
            <span className="text-xs text-slate-500 font-medium">activos</span>
            {cuotasAtrasadasCount > 0 ? (
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                <AlertTriangle className="w-3 h-3 text-red-600" /> {cuotasAtrasadasCount} atraso
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
            <span>Gestión de cuotas</span>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
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
