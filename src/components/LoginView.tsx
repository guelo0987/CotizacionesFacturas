import React, { useState } from 'react';
import type { BusinessSettings } from '../types';
import { getSupabaseClient } from '../services/supabaseClient';
import { ShieldCheck, Mail, Lock, ArrowRight, AlertCircle, Building2 } from 'lucide-react';

interface LoginViewProps {
  settings: BusinessSettings;
  onSuccessLogin: (email: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ settings, onSuccessLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      setErrorMsg('Por favor ingresa tu correo electrónico y contraseña.');
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient(settings.supabase_url, settings.supabase_anon_key);
    
    if (!supabase) {
      setErrorMsg('Error de conexión con Supabase. Verifica las variables de entorno.');
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
        setErrorMsg(`Error de inicio de sesión: ${error.message}`);
      } else if (data.user) {
        onSuccessLogin(data.user.email || cleanEmail);
      }
    } catch (err: any) {
      setErrorMsg(`Error de autenticación: ${err.message || 'Credenciales inválidas'}`);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center p-3">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={settings.business_name}
                className="w-full h-full object-cover rounded-xl"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <Building2 className="w-10 h-10 text-emerald-600" />
            )}
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-slate-800">
              {settings.business_name || 'Sistema de Gestión'}
            </h1>
            <p className="text-sm text-slate-500">
              Iniciar Sesión
            </p>
          </div>
        </div>

        {/* Main Light Pastel Card */}
        <div className="bg-white border border-slate-200 p-8 rounded-2xl space-y-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMsg ? (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@negocio.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                'Autenticando...'
              ) : (
                <>
                  <span>Entrar al Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
