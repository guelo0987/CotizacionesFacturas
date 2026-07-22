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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 pb-safe">
      <div className="max-w-4xl mx-auto flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all duration-200 relative ${
                isActive
                  ? 'text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 w-8 h-1 bg-emerald-500 rounded-b-full shadow-lg shadow-emerald-500/50" />
              )}
              {item.icon}
              <span className="text-[11px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
