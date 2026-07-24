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
    <div className="space-y-6 pb-8">
      {/* Top Banner Hero */}
      <div className="glass-panel border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-widest font-heading">
            <TrendingUp className="w-4 h-4" /> Panel del Negocio
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
            {state.settings.business_name || 'Resumen Operativo'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            Control de cuentas por cobrar, cotizaciones y préstamos en RD$.
          </p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigateTab('documentos')}
          className="glass-card hover:border-emerald-500/30 rounded-3xl p-5 cursor-pointer transition-all duration-200 shadow-xl group hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Por Cobrar</span>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight mb-2 font-heading">
            {formatCurrency(totalPorCobrar)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
            <span>
              {state.facturas.filter((f) => f.saldo_pendiente > 0).length} facturas pendientes
            </span>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('documentos')}
          className="glass-card hover:border-emerald-500/30 rounded-3xl p-5 cursor-pointer transition-all duration-200 shadow-xl group hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cotizaciones</span>
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-400 tracking-tight mb-2 font-heading">
            {cotizacionesActivas.length}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
            <span>Activas por responder</span>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('prestamos')}
          className="glass-card hover:border-emerald-500/30 rounded-3xl p-5 cursor-pointer transition-all duration-200 shadow-xl group hover:scale-[1.01]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Préstamos</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight font-heading">
              {prestamosActivos.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">activos</span>
            {cuotasAtrasadasCount > 0 ? (
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/30">
                <AlertTriangle className="w-3 h-3" /> {cuotasAtrasadasCount} atraso
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
            <span>Gestión de cuotas</span>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
          </div>
        </div>
      </div>

      {/* Quick Actions Card */}
      <div className="glass-panel border border-white/10 rounded-3xl p-5 shadow-2xl space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-heading">
          Acciones Rápidas
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={onOpenNewQuote}
            className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-all text-xs font-semibold hover:border-emerald-500/40 hover:scale-[1.02]"
          >
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <span>+ Cotización</span>
          </button>

          <button
            onClick={onOpenNewInvoice}
            className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-all text-xs font-semibold hover:border-emerald-500/40 hover:scale-[1.02]"
          >
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <span>+ Factura</span>
          </button>

          <button
            onClick={onOpenNewLoan}
            className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-all text-xs font-semibold hover:border-emerald-500/40 hover:scale-[1.02]"
          >
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <span>+ Préstamo</span>
          </button>

          <button
            onClick={onOpenNewClient}
            className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-all text-xs font-semibold hover:border-emerald-500/40 hover:scale-[1.02]"
          >
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <span>+ Cliente</span>
          </button>
        </div>
      </div>

      {/* Recent Invoices Card */}
      <div className="glass-panel border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 font-heading">
            <FileText className="w-4 h-4 text-emerald-400" /> Últimas Facturas Emitidas
          </h3>
          <button
            onClick={() => onNavigateTab('documentos')}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-bold transition-colors"
          >
            Ver todas
          </button>
        </div>

        {state.facturas.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs font-medium">
            No hay facturas registradas aún.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {state.facturas.slice(0, 4).map((fac: Factura) => {
              const cli = state.clientes.find((c) => c.id === fac.cliente_id);
              return (
                <div
                  key={fac.id}
                  onClick={() => onNavigateTab('documentos')}
                  className="py-3.5 flex items-center justify-between hover:bg-slate-800/50 px-3 rounded-2xl cursor-pointer transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm font-heading">{fac.numero}</span>
                      {fac.estado === 'pagada' ? (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                          PAGADA
                        </span>
                      ) : null}
                      {fac.estado === 'parcial' ? (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                          PARCIAL
                        </span>
                      ) : null}
                      {fac.estado === 'pendiente' ? (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2.5 py-0.5 rounded-full border border-red-500/30">
                          PENDIENTE
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-400 truncate max-w-[180px] font-medium">
                      {cli?.nombre || 'Cliente sin asignar'}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-extrabold text-white font-heading">
                      {formatCurrency(fac.total)}
                    </div>
                    {fac.saldo_pendiente > 0 ? (
                      <div className="text-[11px] text-amber-400 font-semibold">
                        Resta: {formatCurrency(fac.saldo_pendiente)}
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-400 font-semibold flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Saldada
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
