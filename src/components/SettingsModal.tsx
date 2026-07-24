import React, { useState } from 'react';
import type { AppState, BusinessSettings } from '../types';
import { ServicesView } from './ServicesView';
import { sanitizeString } from '../utils/sanitizer';
import {
  Settings,
  X,
  Upload,
  Wrench,
  Building,
  Percent,
} from 'lucide-react';

interface SettingsModalProps {
  state: AppState;
  onSaveSettings: (settings: BusinessSettings) => void;
  onClose: () => void;
  onAddServicio: any;
  onUpdateServicio: any;
  onDeleteServicio: any;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  state,
  onSaveSettings,
  onClose,
  onAddServicio,
  onUpdateServicio,
  onDeleteServicio,
}) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'servicios'>('perfil');

  const [formData, setFormData] = useState<BusinessSettings>({
    ...state.settings,
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, logo_url: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      ...formData,
      business_name: sanitizeString(formData.business_name),
      phone: sanitizeString(formData.phone),
      email: sanitizeString(formData.email),
      address: sanitizeString(formData.address),
      documento: sanitizeString(formData.documento),
      itbis_rate: Number(formData.itbis_rate) || 18,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto">
      <div className="glass-panel border border-white/10 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 font-heading">
            <Settings className="w-5 h-5 text-emerald-400" /> Ajustes del Negocio
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center bg-slate-950/80 border border-slate-800 p-1 rounded-2xl gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('perfil')}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'perfil'
                ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building className="w-4 h-4" /> Perfil Comercial & ITBIS
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('servicios')}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'servicios'
                ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-4 h-4" /> Catálogo de Servicios
          </button>
        </div>

        <div className="overflow-y-auto pr-1 flex-1 space-y-4">
          {activeTab === 'perfil' ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center gap-4 glass-card p-4 rounded-2xl border border-white/5">
                {formData.logo_url ? (
                  <img
                    src={formData.logo_url}
                    alt="Logo"
                    className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shadow-sm"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-xs font-semibold">
                    Logo
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-200">
                    Logo del Negocio
                  </label>
                  <label className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3.5 py-2 rounded-xl cursor-pointer transition-all font-semibold border border-slate-700 shadow-sm">
                    <Upload className="w-3.5 h-3.5 text-emerald-400" /> Subir Imagen Logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nombre Comercial / Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={formData.business_name}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    RNC / Cédula del Negocio
                  </label>
                  <input
                    type="text"
                    value={formData.documento}
                    onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
                    placeholder="1-30-00000-0"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Dirección Física
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                />
              </div>

              <div className="glass-card p-4 rounded-2xl border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-heading">
                    <Percent className="w-4 h-4" /> Porcentaje de ITBIS por Defecto
                  </label>
                  <span className="text-sm font-black text-white">{formData.itbis_rate}%</span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="1"
                  value={formData.itbis_rate}
                  onChange={(e) =>
                    setFormData({ ...formData, itbis_rate: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-bold focus:outline-none focus:border-emerald-500 transition-all"
                />
                <p className="text-[11px] text-slate-400">
                  Impuesto sobre Transferencias de Bienes Industrializados y Servicios (18% estándar en R.D.).
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-400 hover:bg-emerald-300 text-slate-950 transition-all shadow-lg shadow-emerald-500/20"
                >
                  Guardar Perfil
                </button>
              </div>
            </form>
          ) : null}

          {activeTab === 'servicios' ? (
            <ServicesView
              state={state}
              onAddServicio={onAddServicio}
              onUpdateServicio={onUpdateServicio}
              onDeleteServicio={onDeleteServicio}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
