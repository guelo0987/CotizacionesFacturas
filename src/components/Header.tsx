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
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 shadow-sm">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Business Brand & Logo */}
        <div className="flex items-center gap-3">
          {settings.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.business_name}
              className="w-10 h-10 rounded-2xl object-cover border border-slate-200 shadow-sm"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold text-base font-heading">
              <Building2 className="w-5 h-5 text-emerald-600" />
            </div>
          )}

          <div>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 truncate max-w-[170px] sm:max-w-xs leading-tight font-heading">
              {settings.business_name || 'Mi Negocio'}
            </h1>
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
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
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-emerald-800 border border-slate-200 px-3 py-1.5 rounded-xl text-sm font-bold transition-all"
            title="Ver Tutorial de Uso"
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Guía</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="tour-ajustes p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl transition-all"
            title="Ajustes del Negocio"
          >
            <Settings className="w-4 h-4" />
          </button>

          {isLoggedIn ? (
            <button
              onClick={onLogout}
              className="p-2 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 rounded-xl transition-all"
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
