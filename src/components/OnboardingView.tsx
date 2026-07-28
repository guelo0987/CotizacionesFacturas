import React, { useState } from 'react';
import { supabaseDataService } from '../services/supabaseDataService';
import { mensajeDeError } from './feedback/contexto';
import { limpiarTexto, primerError, soloDigitos, validarDocumento, validarNombre } from '../utils/validacion';
import { AlertCircle, ArrowRight, Store } from 'lucide-react';

interface OnboardingViewProps {
  emailUsuario: string;
  onCreada: () => void;
  onCerrarSesion: () => void;
}

/**
 * Alta del negocio. Se muestra una sola vez, cuando el usuario ya está
 * autenticado pero todavía no tiene organización asociada.
 */
export const OnboardingView: React.FC<OnboardingViewProps> = ({
  emailUsuario,
  onCreada,
  onCerrarSesion,
}) => {
  const [nombre, setNombre] = useState('');
  const [rnc, setRnc] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;

    const nombreLimpio = limpiarTexto(nombre, 160);
    const fallo = primerError(
      validarNombre(nombreLimpio, 'El nombre del negocio'),
      validarDocumento(rnc, false)
    );
    if (fallo) {
      setErrorMsg(fallo);
      return;
    }

    setEnviando(true);
    setErrorMsg('');
    try {
      await supabaseDataService.crearOrganizacion(nombreLimpio, soloDigitos(rnc) || undefined);
      onCreada();
    } catch (err) {
      setErrorMsg(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
            <Store className="w-8 h-8 text-emerald-600" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">Registra tu negocio</h1>
            <p className="text-sm text-slate-500">
              Un último paso y ya puedes empezar a facturar.
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-7 rounded-2xl shadow-sm space-y-5">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {errorMsg ? (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl flex items-start gap-2"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="nombre-negocio" className="block text-sm font-semibold text-slate-700">
                Nombre del negocio *
              </label>
              <input
                id="nombre-negocio"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Servicios Eléctricos Peña"
                maxLength={160}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
              <p className="text-xs text-slate-500">Es el nombre que saldrá en tus facturas.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="rnc-negocio" className="block text-sm font-semibold text-slate-700">
                RNC o cédula <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                id="rnc-negocio"
                type="text"
                inputMode="numeric"
                value={rnc}
                onChange={(e) => setRnc(soloDigitos(e.target.value).slice(0, 11))}
                placeholder="130000000"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 font-mono placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
              <p className="text-xs text-slate-500">
                9 dígitos para RNC, 11 para cédula. Puedes añadirlo más tarde en Ajustes.
              </p>
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {enviando ? (
                'Creando…'
              ) : (
                <>
                  <span>Crear mi negocio</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 text-center space-y-1">
            <p className="text-xs text-slate-500">Sesión iniciada como {emailUsuario}</p>
            <button
              type="button"
              onClick={onCerrarSesion}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
