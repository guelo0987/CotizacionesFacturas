import React from 'react';
import type { BusinessSettings } from '../types';
import { Settings, HelpCircle, LogOut, Building2 } from 'lucide-react';

interface HeaderProps {
  settings: BusinessSettings;
  isLoggedIn: boolean;
  onOpenSettings: () => void;
  onOpenTutorial: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  isLoggedIn,
  onOpenSettings,
  onOpenTutorial,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-40 glass-panel border-b border-white/10 px-4 py-3 shadow-xl">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Business Brand & Logo */}
        <div className="flex items-center gap-3">
          {settings.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.business_name}
              className="w-10 h-10 rounded-2xl object-cover border border-white/10 shadow-sm"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-base font-heading">
              <Building2 className="w-5 h-5 text-emerald-400" />
            </div>
          )}

          <div>
            <h1 className="text-sm sm:text-base font-extrabold text-white truncate max-w-[170px] sm:max-w-xs leading-tight font-heading">
              {settings.business_name || 'Mi Negocio'}
            </h1>
            <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span>RD$</span>
              <span>•</span>
              <span>ITBIS {settings.itbis_rate}%</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenTutorial}
            className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm"
            title="Ver Tutorial de Uso"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Guía</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="p-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl transition-all"
            title="Ajustes del Negocio"
          >
            <Settings className="w-4 h-4" />
          </button>

          {isLoggedIn ? (
            <button
              onClick={onLogout}
              className="p-2 bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700/80 hover:border-red-500/30 rounded-xl transition-all"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
};
