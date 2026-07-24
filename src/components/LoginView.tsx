import React, { useState } from 'react';
import type { BusinessSettings } from '../types';
import { getSupabaseClient } from '../services/supabaseClient';
import { ShieldCheck, Mail, Lock, ArrowRight, AlertCircle, Building2, UserPlus, LogIn } from 'lucide-react';

interface LoginViewProps {
  settings: BusinessSettings;
  onSuccessLogin: (email: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ settings, onSuccessLogin }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      setErrorMsg('Por favor ingresa tu correo electrónico y contraseña.');
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
    
    if (!supabase) {
      setErrorMsg('Error de conexión con Supabase. Verifica tus variables de entorno.');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'login') {
        // PURE SUPABASE AUTH LOGIN
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPass,
        });

        if (error) {
          setErrorMsg(`Error al iniciar sesión: ${error.message}`);
        } else if (data.user) {
          onSuccessLogin(data.user.email || cleanEmail);
        }
      } else {
        // PURE SUPABASE AUTH REGISTER
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPass,
        });

        if (error) {
          setErrorMsg(`Error en registro: ${error.message}`);
        } else if (data.user) {
          if (data.session) {
            onSuccessLogin(data.user.email || cleanEmail);
          } else {
            setSuccessMsg('¡Usuario registrado exitosamente en Supabase! Puedes iniciar sesión ahora.');
            setMode('login');
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(`Error inesperado: ${err.message || 'Error de autenticación'}`);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Background Soft Pastel Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-slate-300/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-white border border-slate-200/80 shadow-md flex items-center justify-center p-3">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={settings.business_name}
                className="w-full h-full object-cover rounded-2xl"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <Building2 className="w-10 h-10 text-emerald-600" />
            )}
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-heading">
              {settings.business_name || 'Sistema de Gestión'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Autenticación Real con Supabase Auth
            </p>
          </div>
        </div>

        {/* Mode Selector Tabs: Iniciar Sesión / Registrarse */}
        <div className="bg-slate-200/70 p-1 rounded-2xl flex items-center text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              mode === 'login'
                ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LogIn className="w-4 h-4 text-emerald-600" /> Iniciar Sesión
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              mode === 'register'
                ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-4 h-4 text-emerald-600" /> Crear Cuenta
          </button>
        </div>

        {/* Main Light Pastel Card */}
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/90 p-6 sm:p-8 rounded-3xl space-y-6 shadow-xl shadow-slate-200/50">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                {mode === 'login' ? 'Acceso al Sistema' : 'Registro de Nuevo Usuario'}
              </h2>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              Supabase Auth
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg ? (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-2xl font-medium flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{errorMsg}</span>
              </div>
            ) : null}

            {successMsg ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-2xl font-medium flex items-center gap-2 animate-in fade-in">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@negocio.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] transition-all duration-200 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 group mt-2"
            >
              {loading ? (
                'Procesando...'
              ) : (
                <>
                  <span>{mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta en Supabase'}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 text-center border-t border-slate-100">
            <p className="text-[11px] text-slate-400 font-medium">
              Conectado a Supabase Auth · {settings.supabase_url ? 'Nube Activa' : 'Desconectado'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
