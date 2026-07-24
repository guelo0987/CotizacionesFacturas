import React from 'react';
import type { TabType } from '../types';
import { LayoutDashboard, Users, FileText, Landmark } from 'lucide-react';

interface BottomNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
    {
      id: 'inicio',
      label: 'Inicio',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      id: 'clientes',
      label: 'Clientes',
      icon: <Users className="w-5 h-5" />,
    },
    {
      id: 'documentos',
      label: 'Documentos',
      icon: <FileText className="w-5 h-5" />,
    },
    {
      id: 'prestamos',
      label: 'Préstamos',
      icon: <Landmark className="w-5 h-5" />,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-slate-200 pb-safe shadow-lg">
      <div className="max-w-4xl mx-auto flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`tour-nav-${item.id} flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all duration-200 relative ${
                isActive
                  ? 'text-emerald-700 font-extrabold scale-105'
                  : 'text-slate-400 hover:text-slate-800'
              }`}
            >
              {isActive ? (
                <span className="absolute top-0 w-10 h-1 bg-emerald-600 rounded-b-full shadow-sm" />
              ) : null}
              {item.icon}
              <span className="text-xs font-medium leading-none tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
