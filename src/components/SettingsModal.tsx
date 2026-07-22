import React, { useState } from 'react';
import type { AppState, BusinessSettings } from '../types';
import { ServicesView } from './ServicesView';
import { SUPABASE_SQL_SCHEMA } from '../services/supabaseClient';
import { sanitizeString } from '../utils/sanitizer';
import {
  Settings,
  X,
  Upload,
  Database,
  Wrench,
  Building,
  Percent,
  Copy,
  Check,
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
  const [activeTab, setActiveTab] = useState<'perfil' | 'servicios' | 'supabase'>('perfil');
  const [copiedSql, setCopiedSql] = useState(false);

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

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" /> Ajustes del Negocio
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-xl gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('perfil')}
            className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'perfil'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building className="w-3.5 h-3.5" /> Perfil & ITBIS
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('servicios')}
            className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'servicios'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" /> Catálogo Servicios
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('supabase')}
            className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'supabase'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" /> Supabase DB
          </button>
        </div>

        <div className="overflow-y-auto pr-1 flex-1 space-y-4">
          {activeTab === 'perfil' && (
            <form onSubmit={handleSave} className="space-y-3">
              <div className="flex items-center gap-4 bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                {formData.logo_url ? (
                  <img
                    src={formData.logo_url}
                    alt="Logo"
                    className="w-14 h-14 rounded-xl object-cover border border-slate-700"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-slate-800 border border-dashed border-slate-700 flex items-center justify-center text-slate-500">
                    Logo
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Logo del Negocio
                  </label>
                  <label className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors font-medium">
                    <Upload className="w-3.5 h-3.5" /> Subir Imagen
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
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
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
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
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
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Percent className="w-4 h-4" /> Porcentaje de ITBIS por Defecto
                  </label>
                  <span className="text-xs font-black text-white">{formData.itbis_rate}%</span>
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
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-bold focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-400">
                  Impuesto sobre Transferencias de Bienes Industrializados y Servicios (18% estándar en R.D.).
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/40"
                >
                  Guardar Perfil
                </button>
              </div>
            </form>
          )}

          {activeTab === 'servicios' && (
            <ServicesView
              state={state}
              onAddServicio={onAddServicio}
              onUpdateServicio={onUpdateServicio}
              onDeleteServicio={onDeleteServicio}
            />
          )}

          {activeTab === 'supabase' && (
            <div className="space-y-4">
              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-2">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" /> Configuración de Supabase
                </h4>
                <p className="text-xs text-slate-400">
                  Ingresa las credenciales de tu proyecto Supabase para sincronización directa en la nube.
                </p>

                <div className="space-y-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      SUPABASE_URL
                    </label>
                    <input
                      type="text"
                      value={formData.supabase_url || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, supabase_url: e.target.value })
                      }
                      placeholder="https://xyzcompany.supabase.co"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      SUPABASE_ANON_KEY
                    </label>
                    <input
                      type="password"
                      value={formData.supabase_anon_key || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, supabase_anon_key: e.target.value })
                      }
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-slate-200">Script SQL de la Base de Datos</h5>
                    <p className="text-[11px] text-slate-400">
                      Ejecútalo en el Editor SQL de Supabase para crear las 9 tablas automáticamente.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                  >
                    {copiedSql ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> ¡Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copiar SQL
                      </>
                    )}
                  </button>
                </div>

                <pre className="bg-slate-900 p-3 rounded-lg text-[10px] text-emerald-400 font-mono overflow-x-auto max-h-40 border border-slate-800">
                  {SUPABASE_SQL_SCHEMA}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
