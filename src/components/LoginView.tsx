import React, { useState } from 'react';
import { getSupabaseClient } from '../services/supabaseClient';
import { useFeedback, mensajeDeError } from './feedback/contexto';
import { primerError, validarEmail } from '../utils/validacion';
import { AlertCircle, ArrowRight, Building2, Lock, Mail } from 'lucide-react';

type Modo = 'entrar' | 'registrar' | 'recuperar';

/** Traduce los mensajes de Supabase Auth, que llegan en inglés. */
function traducirAuth(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.';
  }
  if (m.includes('user already registered')) {
    return 'Ya existe una cuenta con ese correo. Inicia sesión.';
  }
  if (m.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 8 caracteres.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Demasiados intentos seguidos. Espera un minuto e inténtalo otra vez.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Sin conexión. Revisa tu internet.';
  }
  return mensaje;
}

export const LoginView: React.FC = () => {
  const { exito, info } = useFeedback();

  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const validar = (): string | null => {
    const emailLimpio = email.trim().toLowerCase();
    const fallo = primerError(validarEmail(emailLimpio, true));
    if (fallo) return fallo;

    if (modo === 'recuperar') return null;

    if (!password) return 'La contraseña es obligatoria.';
    if (modo === 'registrar') {
      if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
      if (password !== password2) return 'Las dos contraseñas no coinciden.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;

    const fallo = validar();
    if (fallo) {
      setErrorMsg(fallo);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMsg('La aplicación no está configurada. Contacta al administrador.');
      return;
    }

    setEnviando(true);
    setErrorMsg('');
    const emailLimpio = email.trim().toLowerCase();

    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailLimpio,
          password,
        });
        // Un fallo de autenticación es un fallo: no hay ninguna ruta que
        // deje entrar "por si acaso".
        if (error) throw new Error(traducirAuth(error.message));
      } else if (modo === 'registrar') {
        const { data, error } = await supabase.auth.signUp({
          email: emailLimpio,
          password,
        });
        if (error) throw new Error(traducirAuth(error.message));

        if (data.session) {
          exito('¡Cuenta creada! Ahora registra los datos de tu negocio.');
        } else {
          info('Te enviamos un correo de confirmación. Ábrelo para activar tu cuenta.');
          setModo('entrar');
          setPassword('');
          setPassword2('');
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(emailLimpio, {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) throw new Error(traducirAuth(error.message));
        info('Si ese correo tiene una cuenta, recibirás un enlace para cambiar la contraseña.');
        setModo('entrar');
      }
    } catch (err) {
      setErrorMsg(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const cambiarModo = (nuevo: Modo) => {
    setModo(nuevo);
    setErrorMsg('');
    setPassword('');
    setPassword2('');
  };

  const titulo =
    modo === 'entrar' ? 'Iniciar sesión' : modo === 'registrar' ? 'Crear cuenta' : 'Recuperar acceso';

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
            <Building2 className="w-10 h-10 text-emerald-600" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-slate-800">Cotizaciones y Préstamos</h1>
            <p className="text-sm text-slate-500">{titulo}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-8 rounded-2xl space-y-6 shadow-sm">
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
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@negocio.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                />
              </div>
            </div>

            {modo !== 'recuperar' ? (
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type="password"
                    autoComplete={modo === 'registrar' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                </div>
                {modo === 'registrar' ? (
                  <p className="text-xs text-slate-500">Mínimo 8 caracteres.</p>
                ) : null}
              </div>
            ) : null}

            {modo === 'registrar' ? (
              <div className="space-y-2">
                <label htmlFor="password2" className="block text-sm font-semibold text-slate-700">
                  Repite la contraseña
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password2"
                    type="password"
                    autoComplete="new-password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={enviando}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mt-4"
            >
              {enviando ? (
                'Procesando…'
              ) : (
                <>
                  <span>
                    {modo === 'entrar'
                      ? 'Entrar al sistema'
                      : modo === 'registrar'
                      ? 'Crear mi cuenta'
                      : 'Enviar enlace'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-5 border-t border-slate-100 text-center space-y-2">
            {modo === 'entrar' ? (
              <>
                <button
                  type="button"
                  onClick={() => cambiarModo('registrar')}
                  className="text-sm font-bold text-emerald-600 hover:text-emerald-700"
                >
                  ¿Primera vez? Crea tu cuenta
                </button>
                <div>
                  <button
                    type="button"
                    onClick={() => cambiarModo('recuperar')}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Olvidé mi contraseña
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => cambiarModo('entrar')}
                className="text-sm font-bold text-emerald-600 hover:text-emerald-700"
              >
                Volver a iniciar sesión
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
