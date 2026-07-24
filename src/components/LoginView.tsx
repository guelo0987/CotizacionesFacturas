import React, { useState } from 'react';
import type { BusinessSettings } from '../types';
import { ShieldCheck, Mail, Lock, ArrowRight, Sparkles, Building2 } from 'lucide-react';

interface LoginViewProps {
  settings: BusinessSettings;
  onSuccessLogin: (email: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ settings, onSuccessLogin }) => {
  const [email, setEmail] = useState('yeisito@gmail.com');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      onSuccessLogin(email);
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Dynamic Background Glow Spheres */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto rounded-3xl glass-panel flex items-center justify-center p-3 shadow-2xl border border-white/10 group hover:scale-105 transition-transform duration-300">
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
              <Building2 className="w-10 h-10 text-emerald-400" />
            )}
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
              {settings.business_name || 'Sistema de Gestión'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 font-medium max-w-xs mx-auto">
              Cotizaciones · Facturas · Préstamos · Pagos
            </p>
          </div>
        </div>

        {/* Main Glass Authentication Card */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6 shadow-2xl border border-white/10">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Acceso del Dueño
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
              <Sparkles className="w-3 h-3" /> Privado
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
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
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
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
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.99] transition-all duration-200 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 group mt-2"
            >
              {loading ? (
                'Iniciando Sesión...'
              ) : (
                <>
                  <span>Ingresar al Sistema (Yeisito)</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 text-center border-t border-slate-800/80">
            <p className="text-[11px] text-slate-400 font-medium">
              Moneda: <span className="text-emerald-400 font-semibold">RD$</span> · ITBIS: <span className="text-slate-200 font-semibold">{settings.itbis_rate || 18}%</span>
            </p>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-400 font-medium">
          Sistema protegido y optimizado para móviles
        </p>
      </div>
    </div>
  );
};
