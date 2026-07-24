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
    <div className="fixed inset-0 z-50 bg-white/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto font-sans">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] flex flex-col text-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 font-heading">
            <Settings className="w-5 h-5 text-emerald-600" /> Ajustes del Negocio
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('perfil')}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'perfil'
                ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building className="w-4 h-4" /> Perfil Comercial & ITBIS
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('servicios')}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'servicios'
                ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-4 h-4" /> Catálogo de Servicios
          </button>
        </div>

        <div className="overflow-y-auto pr-1 flex-1 space-y-4">
          {activeTab === 'perfil' ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                {formData.logo_url ? (
                  <img
                    src={formData.logo_url}
                    alt="Logo"
                    className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-xs"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-white border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-sm font-semibold">
                    Logo
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-sm font-bold text-slate-700">
                    Logo del Negocio
                  </label>
                  <label className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 text-sm px-3.5 py-2 rounded-xl cursor-pointer transition-all font-semibold border border-slate-200 shadow-xs">
                    <Upload className="w-3.5 h-3.5 text-emerald-600" /> Subir Imagen Logo
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
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Nombre Comercial / Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={formData.business_name}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-medium"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    RNC / Cédula del Negocio
                  </label>
                  <input
                    type="text"
                    value={formData.documento}
                    onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
                    placeholder="1-30-00000-0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-mono focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Dirección Física
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-medium"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-emerald-800 flex items-center gap-1.5 font-heading">
                    <Percent className="w-4 h-4 text-emerald-600" /> Porcentaje de ITBIS por Defecto
                  </label>
                  <span className="text-sm font-black text-slate-900">{formData.itbis_rate}%</span>
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
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:border-emerald-600 transition-all"
                />
                <p className="text-xs text-slate-400">
                  Impuesto sobre Transferencias de Bienes Industrializados y Servicios (18% estándar en R.D.).
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-2xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-md shadow-emerald-600/20"
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
