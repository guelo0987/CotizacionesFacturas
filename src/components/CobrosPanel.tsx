import React, { useEffect, useMemo, useState } from 'react';
import type { AppState } from '../types';
import {
  filtrarClientes,
  pasaFiltro,
  textoVencimiento,
  type ClientePorCobrar,
  type FiltroCobros,
} from '../utils/cobros';
import { construirUrl, mensajeRecordatorioCobro } from '../utils/whatsapp';
import { formatCurrency, formatTelefono } from '../utils/sanitizer';
import { telefonoParaWhatsapp } from '../utils/validacion';
import { MessageCircle, Phone, X } from 'lucide-react';

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

/** Color del punto y del texto de vencimiento: rojo sólo para lo atrasado. */
function tonoDias(dias: number): { punto: string; texto: string } {
  if (dias < 0) return { punto: 'bg-red-500', texto: 'text-red-600' };
  if (dias === 0) return { punto: 'bg-amber-500', texto: 'text-amber-700' };
  return { punto: 'bg-slate-300', texto: 'text-slate-500' };
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
    [clientes],
  );

  const visibles = useMemo(() => filtrarClientes(clientes, filtro), [clientes, filtro]);
  // El recordatorio siempre lleva todo lo que el cliente debe, sea cual sea el filtro
  const completos = useMemo(() => new Map(clientes.map((c) => [c.clienteId, c])), [clientes]);

  const totalVisible = visibles.reduce((s, c) => s + c.total, 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      {/* En el teléfono sube desde abajo y ocupa el ancho; en pantalla grande, centrado */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cobros-titulo"
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between gap-2">
            <h3 id="cobros-titulo" className="text-base font-bold text-slate-900">
              Cobros pendientes
            </h3>
            <button
              onClick={onClose}
              className="-mr-1 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="text-slate-500">
              {visibles.length} {visibles.length === 1 ? 'cliente' : 'clientes'}
            </span>
            <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(totalVisible)}</span>
          </div>

          {/* Los filtros saltan de línea en vez de cortarse */}
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar cobros">
            {FILTROS.map((f) => {
              const activo = filtro === f.valor;
              const vacio = conteos[f.valor] === 0;
              return (
                <button
                  key={f.valor}
                  role="tab"
                  aria-selected={activo}
                  onClick={() => setFiltro(f.valor)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    activo
                      ? 'bg-slate-900 text-white'
                      : vacio
                        ? 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {f.etiqueta} <span className="tabular-nums opacity-70">{conteos[f.valor]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 overscroll-contain">
          {visibles.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              {filtro === 'todos' ? 'Nadie tiene pagos pendientes esta semana.' : 'Nadie en este filtro.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibles.map((c) => {
                const nombre = c.cliente?.nombre ?? 'Cliente sin asignar';
                const telefono = c.cliente?.telefono ?? '';
                const conWhatsapp = Boolean(telefono && telefonoParaWhatsapp(telefono));
                const tono = tonoDias(c.primera.dias);
                const detalle = c.cuotas.length > 1 ? `${c.cuotas.length} cuotas` : `Cuota #${c.primera.cuota.numero}`;
                return (
                  <li key={c.clienteId} className="relative">
                    {/* Tocar la fila abre el préstamo; los botones van aparte, abajo a la derecha */}
                    <button
                      onClick={() => onVerPrestamo(c.primera.prestamo.id)}
                      className="w-full flex gap-3 px-4 py-3 text-left hover:bg-slate-50"
                      title="Ver préstamo"
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${tono.punto}`} aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold text-sm text-slate-900 truncate">{nombre}</span>
                          <span className="font-bold text-sm text-slate-900 tabular-nums shrink-0">
                            {formatCurrency(c.total)}
                          </span>
                        </span>
                        <span className="block text-xs mt-1 pr-20 truncate">
                          <span className={`font-medium ${tono.texto}`}>{textoVencimiento(c.primera.dias)}</span>
                          <span className="text-slate-400"> · {detalle}</span>
                        </span>
                      </span>
                    </button>

                    <span className="absolute right-2 bottom-1.5 flex">
                      {conWhatsapp ? (
                        <a
                          href={construirUrl(
                            mensajeRecordatorioCobro(completos.get(c.clienteId) ?? c, state.settings),
                            telefono,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"
                          aria-label={`Recordar por WhatsApp a ${nombre}`}
                          title="Recordar por WhatsApp"
                        >
                          <MessageCircle className="w-[18px] h-[18px]" />
                        </a>
                      ) : null}
                      {telefono ? (
                        <a
                          href={`tel:${telefono}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                          aria-label={`Llamar a ${nombre}`}
                          title={`Llamar · ${formatTelefono(telefono)}`}
                        >
                          <Phone className="w-[18px] h-[18px]" />
                        </a>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
