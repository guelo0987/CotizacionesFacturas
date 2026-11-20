import React, { useEffect, useMemo, useState } from 'react';
import type { AppState } from '../types';
import {
  filtrarClientes,
  pasaFiltro,
  textoVencimiento,
  type ClientePorCobrar,
  type FiltroCobros,
} from '../utils/cobros';
import { referenciaPrestamo } from '../utils/documentosPrestamo';
import { construirUrl, mensajeRecordatorioCobro } from '../utils/whatsapp';
import { formatCurrency, formatTelefono } from '../utils/sanitizer';
import { telefonoParaWhatsapp } from '../utils/validacion';
import { Bell, ChevronRight, MessageCircle, Phone, X } from 'lucide-react';

interface CobrosPanelProps {
  state: AppState;
  clientes: ClientePorCobrar[];
  onVerPrestamo: (prestamoId: string) => void;
  onClose: () => void;
}

const FILTROS: { valor: FiltroCobros; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'atrasado', etiqueta: 'Atrasados' },
  { valor: 'ayer', etiqueta: 'Ayer' },
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'manana', etiqueta: 'Mañana' },
  { valor: 'semana', etiqueta: 'Esta semana' },
];

const CLAVE_FILTRO = 'cobros.filtro';

function leerFiltro(): FiltroCobros {
  try {
    const guardado = localStorage.getItem(CLAVE_FILTRO);
    if (FILTROS.some((f) => f.valor === guardado)) return guardado as FiltroCobros;
  } catch {
    // Sin almacenamiento: se empieza por «Todos»
  }
  return 'todos';
}

/** Colores de la etiqueta de vencimiento según lo urgente que sea. */
function estiloDias(dias: number): string {
  if (dias < 0) return 'bg-red-50 text-red-700 border-red-200';
  if (dias === 0) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (dias === 1) return 'bg-sky-50 text-sky-800 border-sky-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

/**
 * La campanita: a quién hay que cobrarle, del más atrasado al que vence
 * más tarde en la semana, con filtro por día.
 */
export const CobrosPanel: React.FC<CobrosPanelProps> = ({ state, clientes, onVerPrestamo, onClose }) => {
  const [filtro, setFiltro] = useState<FiltroCobros>(leerFiltro);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_FILTRO, filtro);
    } catch {
      // El filtro sólo es una comodidad
    }
  }, [filtro]);

  // Escape cierra, como los demás paneles
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onClose]);

  const conteos = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.valor, clientes.filter((c) => pasaFiltro(c, f.valor)).length])),
    [clientes]
  );

  const visibles = useMemo(() => filtrarClientes(clientes, filtro), [clientes, filtro]);
  // El recordatorio siempre lleva todo lo que el cliente debe, sea cual sea el filtro
  const completos = useMemo(() => new Map(clientes.map((c) => [c.clienteId, c])), [clientes]);

  const totalVisible = visibles.reduce((s, c) => s + c.total, 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cobros-titulo"
        className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl my-4 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 p-4 border-b border-slate-200">
          <div>
            <h3 id="cobros-titulo" className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" /> Cobros pendientes
            </h3>
            <p className="text-xs text-slate-500">
              Atrasados y lo que vence en los próximos 7 días, del más urgente al menos.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Filtrar cobros">
          {FILTROS.map((f) => {
            const activo = filtro === f.valor;
            return (
              <button
                key={f.valor}
                role="tab"
                aria-selected={activo}
                onClick={() => setFiltro(f.valor)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  activo
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {f.etiqueta}
                <span className={`ml-1.5 tabular-nums ${activo ? 'text-white/80' : 'text-slate-400'}`}>
                  {conteos[f.valor]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-2 text-xs text-slate-500 flex justify-between">
          <span>
            {visibles.length} {visibles.length === 1 ? 'cliente' : 'clientes'}
          </span>
          <span>
            Por cobrar <strong className="text-slate-800">{formatCurrency(totalVisible)}</strong>
          </span>
        </div>

        <div className="overflow-y-auto px-4 pb-4 space-y-2 flex-1">
          {visibles.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center text-sm text-emerald-800 font-semibold">
              {filtro === 'todos' ? 'Nadie tiene pagos pendientes esta semana. 🎉' : 'No hay clientes en este filtro.'}
            </div>
          ) : (
            visibles.map((c) => {
              const nombre = c.cliente?.nombre ?? 'Cliente sin asignar';
              const telefono = c.cliente?.telefono ?? '';
              const conWhatsapp = Boolean(telefono && telefonoParaWhatsapp(telefono));
              const varias = c.cuotas.length > 1;
              const moraTotal = c.cuotas.reduce((s, q) => s + q.mora, 0);
              return (
                <div key={c.clienteId} className="border border-slate-200 rounded-xl p-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">{nombre}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {varias
                          ? `${c.cuotas.length} cuotas`
                          : `Cuota #${c.primera.cuota.numero} · ${referenciaPrestamo(c.primera.prestamo)}`}
                        {telefono ? ` · ${formatTelefono(telefono)}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-black text-sm text-slate-900 tabular-nums">{formatCurrency(c.total)}</div>
                      {moraTotal > 0 ? (
                        <div className="text-[11px] text-red-600 font-semibold">
                          incl. mora {formatCurrency(moraTotal)}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${estiloDias(c.primera.dias)}`}
                    >
                      {textoVencimiento(c.primera.dias)}
                    </span>
                    {varias
                      ? c.cuotas.slice(1, 4).map((q) => (
                          <span
                            key={q.cuota.id}
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${estiloDias(q.dias)}`}
                          >
                            #{q.cuota.numero}: {textoVencimiento(q.dias).toLowerCase()}
                          </span>
                        ))
                      : null}
                  </div>

                  <div className="mt-2.5 flex items-center gap-1.5">
                    {conWhatsapp ? (
                      <a
                        href={construirUrl(mensajeRecordatorioCobro(completos.get(c.clienteId) ?? c, state.settings), telefono)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Recordar
                      </a>
                    ) : null}
                    {telefono ? (
                      <a
                        href={`tel:${telefono}`}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Phone className="w-3.5 h-3.5" /> Llamar
                      </a>
                    ) : null}
                    <button
                      onClick={() => onVerPrestamo(c.primera.prestamo.id)}
                      className="ml-auto flex items-center gap-0.5 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                    >
                      Ver préstamo <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
