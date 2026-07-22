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
    <div className="space-y-6 pb-6">
      <div className="bg-gradient-to-r from-blue-900/60 via-slate-900 to-emerald-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            <TrendingUp className="w-4 h-4" /> Resumen del Negocio
          </div>
          <h2 className="text-xl font-bold text-white mb-1">
            {state.settings.business_name || 'Panel de Control'}
          </h2>
          <p className="text-xs text-slate-400">
            Control de cuentas por cobrar, cotizaciones y financiamientos en RD$.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigateTab('documentos')}
          className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-2xl p-4 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-emerald-900/10 group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase">Por Cobrar</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-400 tracking-tight mb-1">
            {formatCurrency(totalPorCobrar)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-700/50">
            <span>
              {state.facturas.filter((f) => f.saldo_pendiente > 0).length} facturas pendientes
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-colors" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('documentos')}
          className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-2xl p-4 cursor-pointer transition-all duration-200 shadow-sm group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase">Cotizaciones</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-400 tracking-tight mb-1">
            {cotizacionesActivas.length}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-700/50">
            <span>Activas por responder</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition-colors" />
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('prestamos')}
          className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-2xl p-4 cursor-pointer transition-all duration-200 shadow-sm group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase">Préstamos</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-black text-emerald-400 tracking-tight">
              {prestamosActivos.length}
            </span>
            <span className="text-xs text-slate-400">al día</span>
            {cuotasAtrasadasCount > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/30">
                <AlertTriangle className="w-3 h-3" /> {cuotasAtrasadasCount} atraso
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-700/50">
            <span>Gestión de cuotas</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Acciones Rápidas
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={onOpenNewQuote}
            className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 transition-all text-xs font-semibold hover:border-blue-500/50"
          >
            <PlusCircle className="w-5 h-5 text-blue-400" />
            <span>+ Cotización</span>
          </button>

          <button
            onClick={onOpenNewInvoice}
            className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 transition-all text-xs font-semibold hover:border-amber-500/50"
          >
            <PlusCircle className="w-5 h-5 text-amber-400" />
            <span>+ Factura</span>
          </button>

          <button
            onClick={onOpenNewLoan}
            className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 transition-all text-xs font-semibold hover:border-emerald-500/50"
          >
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <span>+ Préstamo</span>
          </button>

          <button
            onClick={onOpenNewClient}
            className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 transition-all text-xs font-semibold hover:border-purple-500/50"
          >
            <PlusCircle className="w-5 h-5 text-purple-400" />
            <span>+ Cliente</span>
          </button>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" /> Últimas Facturas Emitidas
          </h3>
          <button
            onClick={() => onNavigateTab('documentos')}
            className="text-xs text-emerald-400 hover:underline font-semibold"
          >
            Ver todas
          </button>
        </div>

        {state.facturas.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">
            No hay facturas registradas aún.
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {state.facturas.slice(0, 4).map((fac: Factura) => {
              const cli = state.clientes.find((c) => c.id === fac.cliente_id);
              return (
                <div
                  key={fac.id}
                  onClick={() => onNavigateTab('documentos')}
                  className="py-3 flex items-center justify-between hover:bg-slate-800/40 px-2 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-sm">{fac.numero}</span>
                      {fac.estado === 'pagada' && (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          PAGADA
                        </span>
                      )}
                      {fac.estado === 'parcial' && (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                          PARCIAL
                        </span>
                      )}
                      {fac.estado === 'pendiente' && (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/30">
                          PENDIENTE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate max-w-[180px]">
                      {cli?.nombre || 'Cliente sin asignar'}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-100">
                      {formatCurrency(fac.total)}
                    </div>
                    {fac.saldo_pendiente > 0 ? (
                      <div className="text-[11px] text-amber-400 font-medium">
                        Resta: {formatCurrency(fac.saldo_pendiente)}
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-400 font-medium flex items-center justify-end gap-1">
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
