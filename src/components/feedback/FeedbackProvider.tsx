import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  FeedbackContext,
  type Aviso,
  type OpcionesConfirmacion,
  type TipoAviso,
} from './contexto';

interface ConfirmacionPendiente extends OpcionesConfirmacion {
  resolver: (valor: boolean) => void;
}

/**
 * Avisos y confirmaciones propios de la aplicación.
 *
 * Sustituyen a `alert()` y `confirm()`, que bloquean el hilo, no se pueden
 * estilizar y son suprimidos por los navegadores integrados de Instagram y
 * Facebook — allí el usuario pulsaba "Eliminar" y no ocurría nada.
 */
export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [confirmacion, setConfirmacion] = useState<ConfirmacionPendiente | null>(null);
  const siguienteId = useRef(1);

  const cerrarAviso = useCallback((id: number) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const agregar = useCallback(
    (tipo: TipoAviso, mensaje: string) => {
      const id = siguienteId.current++;
      setAvisos((prev) => [...prev, { id, tipo, mensaje }]);
      // Los errores se quedan más tiempo: suelen requerir leer y actuar
      window.setTimeout(() => cerrarAviso(id), tipo === 'error' ? 8000 : 4000);
    },
    [cerrarAviso]
  );

  const valor = useMemo(
    () => ({
      exito: (mensaje: string) => agregar('exito', mensaje),
      error: (mensaje: string) => agregar('error', mensaje),
      info: (mensaje: string) => agregar('info', mensaje),
      confirmar: (opciones: OpcionesConfirmacion) =>
        new Promise<boolean>((resolver) => setConfirmacion({ ...opciones, resolver })),
    }),
    [agregar]
  );

  const responder = (valorRespuesta: boolean) => {
    confirmacion?.resolver(valorRespuesta);
    setConfirmacion(null);
  };

  return (
    <FeedbackContext.Provider value={valor}>
      {children}

      {/* Pila de avisos */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 space-y-2 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {avisos.map((aviso) => (
          <div
            key={aviso.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-2xl border p-3.5 shadow-lg backdrop-blur-sm ${
              aviso.tipo === 'exito'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900'
                : aviso.tipo === 'error'
                ? 'bg-red-50/95 border-red-200 text-red-900'
                : 'bg-white/95 border-slate-200 text-slate-800'
            }`}
          >
            {aviso.tipo === 'exito' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
            ) : aviso.tipo === 'error' ? (
              <XCircle className="w-5 h-5 shrink-0 text-red-600" />
            ) : (
              <Info className="w-5 h-5 shrink-0 text-slate-500" />
            )}

            <p className="text-sm font-medium leading-snug flex-1">{aviso.mensaje}</p>

            <button
              onClick={() => cerrarAviso(aviso.id)}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Diálogo de confirmación */}
      {confirmacion ? (
        <div
          className="fixed inset-0 z-[110] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  confirmacion.peligroso
                    ? 'bg-red-50 text-red-600 border border-red-200'
                    : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">{confirmacion.titulo}</h3>
                <p className="text-sm text-slate-600 leading-snug">{confirmacion.mensaje}</p>
                {confirmacion.detalle ? (
                  <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5 mt-2 whitespace-pre-line">
                    {confirmacion.detalle}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => responder(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                {confirmacion.textoCancelar ?? 'Cancelar'}
              </button>
              <button
                autoFocus
                onClick={() => responder(true)}
                className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors ${
                  confirmacion.peligroso
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {confirmacion.textoConfirmar ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
};
