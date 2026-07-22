import React from 'react';
import type { BusinessSettings } from '../types';
import { Settings, LogIn, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  settings: BusinessSettings;
  isLoggedIn: boolean;
  onOpenSettings: () => void;
  onOpenLogin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  isLoggedIn,
  onOpenSettings,
  onOpenLogin,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Business Brand & Logo */}
        <div className="flex items-center gap-3">
          {settings.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.business_name}
              className="w-10 h-10 rounded-xl object-cover border border-slate-700 shadow-sm"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-lg">
              {settings.business_name ? settings.business_name.charAt(0).toUpperCase() : 'N'}
            </div>
          )}

          <div>
            <h1 className="text-base font-bold text-slate-100 truncate max-w-[200px] sm:max-w-xs leading-tight">
              {settings.business_name || 'Mi Negocio'}
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              RD$ · ITBIS {settings.itbis_rate}%
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sesión Activa</span>
            </div>
          ) : (
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 text-blue-400" />
              <span>Ingresar</span>
            </button>
          )}

          <button
            onClick={onOpenSettings}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg transition-colors"
            title="Ajustes del Negocio"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
