import React, { useState } from 'react';
import type { BusinessSettings } from '../types';
import { getSupabaseClient } from '../services/supabaseClient';
import { ShieldCheck, Mail, Lock, ArrowRight, AlertCircle, Building2 } from 'lucide-react';

interface LoginViewProps {
  settings: BusinessSettings;
  onSuccessLogin: (email: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ settings, onSuccessLogin }) => {
  const [email, setEmail] = useState('yeisito@gmail.com');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    // 1. Try Supabase Auth Login if configured
    const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
    if (supabase && (cleanEmail.includes('@'))) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPass,
        });

        if (!error && data.user) {
          onSuccessLogin(data.user.email || cleanEmail);
          setLoading(false);
          return;
        }
      } catch (e) {
        // Fallback to strict credential verification
      }
    }

    // 2. Strict Credential Verification for owner
    if ((cleanEmail === 'yeisito@gmail.com' || cleanEmail === 'yeisito') && cleanPass === '123456') {
      onSuccessLogin('yeisito@gmail.com');
      setErrorMsg('');
    } else {
      setErrorMsg('Usuario o contraseña incorrectos. Verifica e intenta de nuevo.');
    }

    setLoading(false);
  };

  const handleQuickLoginYeisito = () => {
    setEmail('yeisito@gmail.com');
    setPassword('123456');
    setErrorMsg('');
    onSuccessLogin('yeisito@gmail.com');
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
              Acceso Privado al Sistema
            </p>
          </div>
        </div>

        {/* Main Light Pastel Card */}
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/90 p-6 sm:p-8 rounded-3xl space-y-6 shadow-xl shadow-slate-200/50">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                Iniciar Sesión
              </h2>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              RD$
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg ? (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-2xl font-medium flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{errorMsg}</span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Usuario / Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
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
                'Verificando...'
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="pt-3 text-center border-t border-slate-100 space-y-2">
            <button
              onClick={handleQuickLoginYeisito}
              className="w-full py-2.5 rounded-2xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-emerald-800 border border-slate-200 transition-colors"
            >
              Autenticar como Yeisito (Dueño)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
