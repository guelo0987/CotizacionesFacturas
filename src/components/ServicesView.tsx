import React, { useMemo, useState } from 'react';
import type { AppState, Servicio, CategoriaServicio, UnidadServicio } from '../types';
import { formatCurrency } from '../utils/sanitizer';
import {
  limpiarTexto,
  limpiarTextoMultilinea,
  primerError,
  sanearNumero,
  validarMonto,
  validarNombre,
} from '../utils/validacion';
import { CampoMoneda } from './campos/CampoMoneda';
import { useAccionAsync } from '../hooks/useAccionAsync';
import { AlertCircle, CheckCircle, Edit2, Plus, Trash2, Wrench, X, XCircle } from 'lucide-react';

interface ServicesViewProps {
  state: AppState;
  onAddServicio: (servicio: Omit<Servicio, 'id' | 'created_at'>) => Promise<void>;
  onUpdateServicio: (servicio: Servicio) => Promise<void>;
  onDeleteServicio: (id: string) => Promise<void>;
}

const FORM_VACIO = {
  nombre: '',
  categoria: 'plomería' as CategoriaServicio,
  descripcion: '',
  // `null` y no `0`: el campo nace vacío, sin un cero pegado delante de lo
  // que se teclee después.
  precio_base: null as number | null,
  unidad: 'servicio' as UnidadServicio,
  activo: true,
};

const CATEGORIAS: { id: string; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'plomería', label: 'Plomería' },
  { id: 'electricidad', label: 'Electricidad' },
  { id: 'pintura', label: 'Pintura' },
  { id: 'otros', label: 'Otros' },
];

/**
 * Catálogo de servicios. Se renderiza dentro del modal de ajustes, que es
 * blanco: todo este componente estaba en tema oscuro y su encabezado
 * `text-slate-100` resultaba invisible sobre el fondo claro.
 */
export const ServicesView: React.FC<ServicesViewProps> = ({
  state,
  onAddServicio,
  onUpdateServicio,
  onDeleteServicio,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServicio, setEditingServicio] = useState<Servicio | null>(null);
  const [formData, setFormData] = useState(FORM_VACIO);
  const [errorForm, setErrorForm] = useState('');

  const { ejecutando, ejecutar } = useAccionAsync();

  const filtrados = useMemo(
    () =>
      state.servicios.filter((s) =>
        selectedCategory === 'todos' ? true : s.categoria === selectedCategory
      ),
    [state.servicios, selectedCategory]
  );

  const openCreateModal = () => {
    setEditingServicio(null);
    setFormData(FORM_VACIO);
    setErrorForm('');
    setIsModalOpen(true);
  };

  const openEditModal = (servicio: Servicio) => {
    setEditingServicio(servicio);
    setFormData({
      nombre: servicio.nombre,
      categoria: servicio.categoria,
      descripcion: servicio.descripcion ?? '',
      precio_base: Number(servicio.precio_base) || 0,
      unidad: servicio.unidad,
      activo: servicio.activo,
    });
    setErrorForm('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nombre = limpiarTexto(formData.nombre, 160);
    const fallo = primerError(
      validarNombre(nombre, 'El nombre del servicio'),
      // Dejar el campo vacío equivale a un precio de cero: hay servicios que
      // se cotizan a convenir y no deben bloquear el guardado.
      validarMonto(formData.precio_base ?? 0, 'El precio base', { permitirCero: true })
    );
    if (fallo) {
      setErrorForm(fallo);
      return;
    }

    const duplicado = state.servicios.find(
      (s) => s.nombre.toLowerCase() === nombre.toLowerCase() && s.id !== editingServicio?.id
    );
    if (duplicado) {
      setErrorForm('Ya existe un servicio con ese nombre en el catálogo.');
      return;
    }

    const payload = {
      nombre,
      categoria: formData.categoria,
      descripcion: limpiarTextoMultilinea(formData.descripcion, 500),
      precio_base: sanearNumero(formData.precio_base ?? 0, {
        min: 0,
        max: 99999999,
        decimales: 2,
      }),
      unidad: formData.unidad,
      activo: formData.activo,
    };

    const ok = await ejecutar(async () => {
      if (editingServicio) {
        await onUpdateServicio({ ...editingServicio, ...payload });
      } else {
        await onAddServicio(payload);
      }
    });

    if (ok) setIsModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-emerald-600" /> Catálogo de servicios
          </h3>
          <p className="text-xs text-slate-500">
            Servicios reutilizables para cotizaciones y facturas.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-2 rounded-xl transition-all shrink-0"
        >
          <Plus className="w-4 h-4" /> Nuevo
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {CATEGORIAS.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
              selectedCategory === cat.id
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center">
          <Wrench className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">
            {selectedCategory === 'todos'
              ? 'Aún no tienes servicios en el catálogo.'
              : 'No hay servicios en esta categoría.'}
          </p>
          <button
            onClick={openCreateModal}
            className="mt-2 text-sm text-emerald-600 font-semibold hover:underline"
          >
            + Agregar el primer servicio
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtrados.map((servicio) => (
            <div
              key={servicio.id}
              className={`bg-white border rounded-2xl p-4 transition-all flex flex-col justify-between ${
                servicio.activo ? 'border-slate-200' : 'border-slate-200 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-bold text-slate-900 text-sm leading-snug min-w-0">
                    {servicio.nombre}
                  </h4>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditModal(servicio)}
                      className="p-1 text-slate-400 hover:text-emerald-700 rounded hover:bg-slate-100"
                      title="Editar servicio"
                      aria-label={`Editar ${servicio.nombre}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => void ejecutar(() => onDeleteServicio(servicio.id))}
                      className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                      title="Eliminar servicio"
                      aria-label={`Eliminar ${servicio.nombre}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                    {servicio.categoria}
                  </span>
                  <span className="text-[11px] text-slate-500">por {servicio.unidad}</span>
                </div>

                {servicio.descripcion ? (
                  <p className="text-xs text-slate-500 line-clamp-2 mb-3">{servicio.descripcion}</p>
                ) : null}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                <span className="text-base font-black text-emerald-700">
                  {formatCurrency(servicio.precio_base)}
                </span>

                <button
                  onClick={() =>
                    void ejecutar(() => onUpdateServicio({ ...servicio, activo: !servicio.activo }))
                  }
                  disabled={ejecutando}
                  className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
                    servicio.activo
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                  title={servicio.activo ? 'Desactivar servicio' : 'Activar servicio'}
                >
                  {servicio.activo ? (
                    <>
                      <CheckCircle className="w-3 h-3" /> Activo
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3" /> Inactivo
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen ? (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingServicio ? 'Editar servicio' : 'Nuevo servicio'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              {errorForm ? (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorForm}</span>
                </div>
              ) : null}

              <div>
                <label htmlFor="serv-nombre" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre del servicio *
                </label>
                <input
                  id="serv-nombre"
                  type="text"
                  maxLength={160}
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Destape de drenaje / Pintura exterior"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="serv-cat" className="block text-xs font-semibold text-slate-700 mb-1">
                    Categoría
                  </label>
                  <select
                    id="serv-cat"
                    value={formData.categoria}
                    onChange={(e) =>
                      setFormData({ ...formData, categoria: e.target.value as CategoriaServicio })
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="plomería">Plomería</option>
                    <option value="electricidad">Electricidad</option>
                    <option value="pintura">Pintura</option>
                    <option value="otros">Otros</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="serv-unidad" className="block text-xs font-semibold text-slate-700 mb-1">
                    Unidad
                  </label>
                  <select
                    id="serv-unidad"
                    value={formData.unidad}
                    onChange={(e) =>
                      setFormData({ ...formData, unidad: e.target.value as UnidadServicio })
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="servicio">Servicio completo</option>
                    <option value="hora">Por hora</option>
                    <option value="unidad">Por unidad</option>
                    <option value="m²">Por m²</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="serv-precio" className="block text-xs font-semibold text-slate-700 mb-1">
                  Precio base *
                </label>
                <CampoMoneda
                  id="serv-precio"
                  value={formData.precio_base}
                  onChange={(precio_base) => setFormData({ ...formData, precio_base })}
                />
              </div>

              <div>
                <label htmlFor="serv-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                  Descripción
                </label>
                <textarea
                  id="serv-desc"
                  rows={2}
                  maxLength={500}
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  placeholder="Detalles incluidos en el servicio…"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ejecutando}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {ejecutando ? 'Guardando…' : 'Guardar servicio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
