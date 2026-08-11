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
import { CampoNumero } from './campos/CampoNumero';
import { useAccionAsync } from '../hooks/useAccionAsync';
import { useFeedback } from './feedback/contexto';
import { AlertCircle, Building, Percent, QrCode, Settings, Upload, Wrench, X } from 'lucide-react';

interface SettingsModalProps {
  state: AppState;
  onSaveSettings: (settings: BusinessSettings) => Promise<void>;
  onSubirImagen: (archivo: File, tipo: 'logo' | 'qr') => Promise<string>;
  onClose: () => void;
  onAddServicio: (servicio: Omit<Servicio, 'id' | 'created_at'>) => Promise<void>;
  onUpdateServicio: (servicio: Servicio) => Promise<void>;
  onDeleteServicio: (id: string) => Promise<void>;
}

const MAX_IMAGEN_BYTES = 2 * 1024 * 1024; // 2 MB
const TIPOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

type FormularioAjustes = Omit<BusinessSettings, 'itbis_rate'> & { itbis_rate: number | null };

export const SettingsModal: React.FC<SettingsModalProps> = ({
  state,
  onSaveSettings,
  onSubirImagen,
  onClose,
  onAddServicio,
  onUpdateServicio,
  onDeleteServicio,
}) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'servicios'>('perfil');
  // `itbis_rate` admite `null` sólo en el formulario: el campo puede
  // quedarse vacío mientras se escribe. Al guardar vuelve a ser un número
  // (18% por defecto), que es lo que espera `BusinessSettings`.
  const [formData, setFormData] = useState<FormularioAjustes>({ ...state.settings });
  const [errorForm, setErrorForm] = useState('');
  const [subiendo, setSubiendo] = useState<'logo' | 'qr' | null>(null);

  const { ejecutando, ejecutar } = useAccionAsync();
  const { error: avisarError } = useFeedback();

  /**
   * El logo va a Supabase Storage.
   *
   * Antes se guardaba como data URL en base64 dentro de `localStorage`: una
   * foto de 2 MB ocupaba ~2,7 MB de texto, agotaba la cuota del navegador y
   * a partir de ahí la aplicación dejaba de guardar todo en silencio.
   */
  const subirImagen = (tipo: 'logo' | 'qr') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;

    const nombre = tipo === 'logo' ? 'El logo' : 'El código QR';

    if (!TIPOS_IMAGEN.includes(archivo.type)) {
      setErrorForm(`${nombre} debe ser una imagen PNG, JPG, WEBP o SVG.`);
      return;
    }
    if (archivo.size > MAX_IMAGEN_BYTES) {
      setErrorForm(`${nombre} no puede pasar de 2 MB. Reduce la imagen e inténtalo otra vez.`);
      return;
    }

    setSubiendo(tipo);
    setErrorForm('');
    try {
      const url = await onSubirImagen(archivo, tipo);
      setFormData((prev) => (tipo === 'logo' ? { ...prev, logo_url: url } : { ...prev, qr_url: url }));
    } catch (err) {
      avisarError(err instanceof Error ? err.message : `No se pudo subir ${nombre.toLowerCase()}.`);
    } finally {
      setSubiendo(null);
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
                      subiendo === 'logo' ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    {subiendo === 'logo' ? 'Subiendo…' : 'Subir imagen'}
                    <input
                      type="file"
                      accept={TIPOS_IMAGEN.join(',')}
                      onChange={subirImagen('logo')}
                      disabled={subiendo !== null}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-slate-500">PNG, JPG, WEBP o SVG. Máximo 2 MB.</p>
                </div>
              </div>

              {/* Código QR: sale al pie de cotizaciones y facturas, para que
                  el cliente escanee y llegue a las redes del negocio. */}
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                {formData.qr_url ? (
                  <img
                    src={formData.qr_url}
                    alt="Código QR del negocio"
                    className="w-16 h-16 rounded-2xl object-contain bg-white border border-slate-200 p-1"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-white border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                    <QrCode className="w-6 h-6" />
                  </div>
                )}

                <div className="space-y-1 min-w-0">
                  <span className="block text-sm font-bold text-slate-700">Código QR</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label
                      className={`inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 text-sm px-3.5 py-2 rounded-xl transition-all font-semibold border border-slate-200 ${
                        subiendo === 'qr' ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-600" />
                      {subiendo === 'qr' ? 'Subiendo…' : 'Subir imagen'}
                      <input
                        type="file"
                        accept={TIPOS_IMAGEN.join(',')}
                        onChange={subirImagen('qr')}
                        disabled={subiendo !== null}
                        className="hidden"
                      />
                    </label>
                    {formData.qr_url ? (
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, qr_url: '' }))}
                        className="text-xs font-semibold text-slate-500 hover:text-red-600"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500">
                    Aparece al pie de tus cotizaciones y facturas con el texto «Síguenos en
                    nuestras redes». Opcional.
                  </p>
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
                  <span className="text-sm font-black text-slate-900">
                    {formData.itbis_rate ?? 0}%
                  </span>
                </div>
                <CampoNumero
                  id="cfg-itbis"
                  value={formData.itbis_rate}
                  onChange={(itbis_rate) => setFormData({ ...formData, itbis_rate })}
                  max={50}
                  decimales={2}
                  sufijo="%"
                  className="!px-3.5 text-slate-900"
                />
                <p className="text-xs text-slate-500">
                  Impuesto sobre Transferencias de Bienes Industrializados y Servicios. El estándar
                  en República Dominicana es 18%.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={ejecutando || subiendo !== null}
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
