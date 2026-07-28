import React, { useState } from 'react';
import type { AppState, BusinessSettings, Servicio } from '../types';
import { ServicesView } from './ServicesView';
import { formatDocumento, formatTelefono } from '../utils/sanitizer';
import {
  limpiarTexto,
  primerError,
  sanearNumero,
  soloDigitos,
  validarDocumento,
  validarEmail,
  validarNombre,
  validarPorcentaje,
  validarTelefono,
} from '../utils/validacion';
import { useAccionAsync } from '../hooks/useAccionAsync';
import { useFeedback } from './feedback/contexto';
import { AlertCircle, Building, Percent, Settings, Upload, Wrench, X } from 'lucide-react';

interface SettingsModalProps {
  state: AppState;
  onSaveSettings: (settings: BusinessSettings) => Promise<void>;
  onSubirLogo: (archivo: File) => Promise<string>;
  onClose: () => void;
  onAddServicio: (servicio: Omit<Servicio, 'id' | 'created_at'>) => Promise<void>;
  onUpdateServicio: (servicio: Servicio) => Promise<void>;
  onDeleteServicio: (id: string) => Promise<void>;
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  state,
  onSaveSettings,
  onSubirLogo,
  onClose,
  onAddServicio,
  onUpdateServicio,
  onDeleteServicio,
}) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'servicios'>('perfil');
  const [formData, setFormData] = useState<BusinessSettings>({ ...state.settings });
  const [errorForm, setErrorForm] = useState('');
  const [subiendoLogo, setSubiendoLogo] = useState(false);

  const { ejecutando, ejecutar } = useAccionAsync();
  const { error: avisarError } = useFeedback();

  /**
   * El logo va a Supabase Storage.
   *
   * Antes se guardaba como data URL en base64 dentro de `localStorage`: una
   * foto de 2 MB ocupaba ~2,7 MB de texto, agotaba la cuota del navegador y
   * a partir de ahí la aplicación dejaba de guardar todo en silencio.
   */
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;

    if (!TIPOS_LOGO.includes(archivo.type)) {
      setErrorForm('El logo debe ser una imagen PNG, JPG, WEBP o SVG.');
      return;
    }
    if (archivo.size > MAX_LOGO_BYTES) {
      setErrorForm('El logo no puede pasar de 2 MB. Reduce la imagen e inténtalo otra vez.');
      return;
    }

    setSubiendoLogo(true);
    setErrorForm('');
    try {
      const url = await onSubirLogo(archivo);
      setFormData((prev) => ({ ...prev, logo_url: url }));
    } catch (err) {
      avisarError(err instanceof Error ? err.message : 'No se pudo subir el logo.');
    } finally {
      setSubiendoLogo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const nombre = limpiarTexto(formData.business_name, 160);
    const telefono = soloDigitos(formData.phone);
    const email = limpiarTexto(formData.email, 254).toLowerCase();
    const documento = soloDigitos(formData.documento);

    const fallo = primerError(
      validarNombre(nombre, 'El nombre comercial'),
      validarTelefono(telefono),
      validarEmail(email),
      validarDocumento(documento),
      validarPorcentaje(formData.itbis_rate, 'La tasa de ITBIS', 50)
    );
    if (fallo) {
      setErrorForm(fallo);
      return;
    }

    const ok = await ejecutar(() =>
      onSaveSettings({
        ...formData,
        business_name: nombre,
        phone: telefono,
        email,
        address: limpiarTexto(formData.address, 250),
        documento,
        itbis_rate: sanearNumero(formData.itbis_rate, { min: 0, max: 50, decimales: 2, porDefecto: 18 }),
      })
    );

    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto font-sans">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[92vh] flex flex-col text-slate-900 my-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 font-heading">
            <Settings className="w-5 h-5 text-emerald-600" /> Ajustes del negocio
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Cerrar ajustes"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('perfil')}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'perfil'
                ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building className="w-4 h-4" /> Perfil e ITBIS
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('servicios')}
            className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'servicios'
                ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-4 h-4" /> Catálogo
          </button>
        </div>

        <div className="overflow-y-auto pr-1 flex-1 space-y-4">
          {activeTab === 'perfil' ? (
            <form onSubmit={handleSave} className="space-y-4" noValidate>
              {errorForm ? (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorForm}</span>
                </div>
              ) : null}

              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                {formData.logo_url ? (
                  <img
                    src={formData.logo_url}
                    alt="Logo del negocio"
                    className="w-16 h-16 rounded-2xl object-contain bg-white border border-slate-200"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-white border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs font-semibold">
                    Logo
                  </div>
                )}

                <div className="space-y-1">
                  <span className="block text-sm font-bold text-slate-700">Logo del negocio</span>
                  <label
                    className={`inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 text-sm px-3.5 py-2 rounded-xl transition-all font-semibold border border-slate-200 ${
                      subiendoLogo ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    {subiendoLogo ? 'Subiendo…' : 'Subir imagen'}
                    <input
                      type="file"
                      accept={TIPOS_LOGO.join(',')}
                      onChange={handleLogoUpload}
                      disabled={subiendoLogo}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-slate-500">PNG, JPG, WEBP o SVG. Máximo 2 MB.</p>
                </div>
              </div>

              <div>
                <label htmlFor="cfg-nombre" className="block text-sm font-bold text-slate-700 mb-1">
                  Nombre comercial / razón social *
                </label>
                <input
                  id="cfg-nombre"
                  type="text"
                  maxLength={160}
                  value={formData.business_name}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cfg-tel" className="block text-sm font-bold text-slate-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    id="cfg-tel"
                    type="tel"
                    inputMode="tel"
                    value={formatTelefono(formData.phone)}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: soloDigitos(e.target.value).slice(0, 11) })
                    }
                    placeholder="(809) 000-0000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-medium"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-rnc" className="block text-sm font-bold text-slate-700 mb-1">
                    RNC / Cédula
                  </label>
                  <input
                    id="cfg-rnc"
                    type="text"
                    inputMode="numeric"
                    value={formatDocumento(formData.documento)}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        documento: soloDigitos(e.target.value).slice(0, 11),
                      })
                    }
                    placeholder="1-30-00000-0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-mono focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cfg-email" className="block text-sm font-bold text-slate-700 mb-1">
                  Correo electrónico
                </label>
                <input
                  id="cfg-email"
                  type="email"
                  maxLength={254}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-medium"
                />
              </div>

              <div>
                <label htmlFor="cfg-dir" className="block text-sm font-bold text-slate-700 mb-1">
                  Dirección física
                </label>
                <input
                  id="cfg-dir"
                  type="text"
                  maxLength={250}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all font-medium"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="cfg-itbis"
                    className="text-sm font-bold text-emerald-800 flex items-center gap-1.5 font-heading"
                  >
                    <Percent className="w-4 h-4 text-emerald-600" /> ITBIS por defecto
                  </label>
                  <span className="text-sm font-black text-slate-900">{formData.itbis_rate}%</span>
                </div>
                <input
                  id="cfg-itbis"
                  type="number"
                  min={0}
                  max={50}
                  step="any"
                  value={formData.itbis_rate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      itbis_rate: sanearNumero(e.target.value, {
                        min: 0,
                        max: 50,
                        decimales: 2,
                        porDefecto: 18,
                      }),
                    })
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:border-emerald-600 transition-all"
                />
                <p className="text-xs text-slate-500">
                  Impuesto sobre Transferencias de Bienes Industrializados y Servicios. El estándar
                  en República Dominicana es 18%.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={ejecutando || subiendoLogo}
                  className="px-6 py-2.5 rounded-2xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white transition-all shadow-md shadow-emerald-600/20"
                >
                  {ejecutando ? 'Guardando…' : 'Guardar perfil'}
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
