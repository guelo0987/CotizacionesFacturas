import React, { useState } from 'react';
import type { BusinessSettings } from '../types';
import { getSupabaseClient } from '../services/supabaseClient';
import { ShieldCheck, Mail, Lock, ArrowRight, AlertCircle, Building2, UserCheck } from 'lucide-react';

interface LoginViewProps {
  settings: BusinessSettings;
  onSuccessLogin: (email: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ settings, onSuccessLogin }) => {
  const [email, setEmail] = useState('yeisito@gmail.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanPass) {
      setErrorMsg('Por favor ingresa tu contraseña.');
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
    
    if (!supabase) {
      setErrorMsg('No se pudo conectar con el servidor de Supabase. Revisa las variables de entorno.');
      setLoading(false);
      return;
    }

    try {
      // 100% PURE SUPABASE AUTH SIGN IN
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPass,
      });

      if (error) {
        // If user doesn't exist yet, attempt automatic sign up via Supabase Auth
        if (error.message.includes('Invalid login credentials')) {
          const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email: cleanEmail,
            password: cleanPass,
          });

          if (signUpErr) {
            setErrorMsg(`Supabase Auth: ${signUpErr.message}`);
          } else if (signUpData.user) {
            if (signUpData.session) {
              onSuccessLogin(signUpData.user.email || cleanEmail);
            } else {
              setInfoMsg('Cuenta registrada en Supabase. Si se requiere confirmación por correo, revisa tu bandeja de entrada o intenta ingresar de nuevo.');
            }
          }
        } else if (error.message.includes('Email not confirmed')) {
          // Allow access if email confirmation is disabled or fallback session present
          const { data: retryData } = await supabase.auth.getSession();
          if (retryData.session) {
            onSuccessLogin(cleanEmail);
          } else {
            setErrorMsg('Supabase Auth: Tu correo está pendiente de confirmación. Revisa tu bandeja de entrada o deshabilita la confirmación en el panel de Supabase Auth.');
          }
        } else {
          setErrorMsg(`Supabase Auth Error: ${error.message}`);
        }
      } else if (data.user) {
        onSuccessLogin(data.user.email || cleanEmail);
      }
    } catch (err: any) {
      setErrorMsg(`Error de conexión con Supabase: ${err.message || 'Error desconocido'}`);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Background Soft Pastel Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-slate-300/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-8 relative z-10">
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
              Autenticación Real vía Supabase Auth
            </p>
          </div>
        </div>

        {/* Main Light Pastel Card */}
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/90 p-6 sm:p-8 rounded-3xl space-y-6 shadow-xl shadow-slate-200/50">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                Iniciar Sesión (Supabase Auth)
              </h2>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1">
              <UserCheck className="w-3 h-3" /> Real Auth
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg ? (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-2xl font-medium flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{errorMsg}</span>
              </div>
            ) : null}

            {infoMsg ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-2xl font-medium flex items-center gap-2 animate-in fade-in">
                <UserCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{infoMsg}</span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Correo Electrónico (Supabase Auth)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yeisito@gmail.com"
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
                  placeholder="Ingresa tu contraseña"
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
                'Autenticando con Supabase...'
              ) : (
                <>
                  <span>Ingresar con Supabase Auth</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 text-center border-t border-slate-100">
            <p className="text-[11px] text-slate-400 font-medium">
              Conectado directamente a <span className="text-emerald-700 font-bold font-mono">hxeovachlapvfubcebha.supabase.co</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
