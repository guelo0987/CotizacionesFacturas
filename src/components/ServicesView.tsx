import React, { useState } from 'react';
import type { AppState, Servicio, CategoriaServicio, UnidadServicio } from '../types';
import { sanitizeString, formatCurrency } from '../utils/sanitizer';
import { Wrench, Plus, Edit2, Trash2, CheckCircle, XCircle, X } from 'lucide-react';

interface ServicesViewProps {
  state: AppState;
  onAddServicio: (servicio: Omit<Servicio, 'id' | 'created_at'>) => void;
  onUpdateServicio: (servicio: Servicio) => void;
  onDeleteServicio: (id: string) => void;
}

export const ServicesView: React.FC<ServicesViewProps> = ({
  state,
  onAddServicio,
  onUpdateServicio,
  onDeleteServicio,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServicio, setEditingServicio] = useState<Servicio | null>(null);

  const [formData, setFormData] = useState<{
    nombre: string;
    categoria: CategoriaServicio;
    descripcion: string;
    precio_base: number;
    unidad: UnidadServicio;
    activo: boolean;
  }>({
    nombre: '',
    categoria: 'plomería',
    descripcion: '',
    precio_base: 0,
    unidad: 'servicio',
    activo: true,
  });

  const categories: { id: string; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'plomería', label: 'Plomería' },
    { id: 'electricidad', label: 'Electricidad' },
    { id: 'pintura', label: 'Pintura' },
    { id: 'otros', label: 'Otros' },
  ];

  const filteredServicios = state.servicios.filter((s: Servicio) => {
    if (selectedCategory === 'todos') return true;
    return s.categoria === selectedCategory;
  });

  const openCreateModal = () => {
    setEditingServicio(null);
    setFormData({
      nombre: '',
      categoria: 'plomería',
      descripcion: '',
      precio_base: 0,
      unidad: 'servicio',
      activo: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (servicio: Servicio) => {
    setEditingServicio(servicio);
    setFormData({
      nombre: servicio.nombre,
      categoria: servicio.categoria,
      descripcion: servicio.descripcion,
      precio_base: servicio.precio_base,
      unidad: servicio.unidad,
      activo: servicio.activo,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;

    const payload = {
      nombre: sanitizeString(formData.nombre),
      categoria: formData.categoria,
      descripcion: sanitizeString(formData.descripcion),
      precio_base: Number(formData.precio_base) || 0,
      unidad: formData.unidad,
      activo: formData.activo,
    };

    if (editingServicio) {
      onUpdateServicio({ ...editingServicio, ...payload });
    } else {
      onAddServicio(payload);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-emerald-400" /> Catálogo de Servicios
          </h3>
          <p className="text-xs text-slate-400">
            Servicios reutilizables para cotizaciones y facturas.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3 py-2 rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" /> Nuevo Servicio
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredServicios.map((servicio: Servicio) => (
          <div
            key={servicio.id}
            className={`bg-slate-800/80 border rounded-2xl p-4 transition-all flex flex-col justify-between ${
              servicio.activo ? 'border-slate-700/80' : 'border-slate-800 opacity-60'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="font-bold text-slate-100 text-sm leading-snug">
                  {servicio.nombre}
                </h4>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(servicio)}
                    className="p-1 text-slate-400 hover:text-slate-200"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`¿Eliminar ${servicio.nombre}?`)) {
                        onDeleteServicio(servicio.id);
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-red-400"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                  {servicio.categoria}
                </span>
                <span className="text-[11px] text-slate-400">por {servicio.unidad}</span>
              </div>

              {servicio.descripcion && (
                <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                  {servicio.descripcion}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
              <span className="text-base font-black text-emerald-400">
                {formatCurrency(servicio.precio_base)}
              </span>

              <button
                onClick={() => onUpdateServicio({ ...servicio, activo: !servicio.activo })}
                className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                  servicio.activo
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-700/50 text-slate-400 border-slate-700'
                }`}
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">
                {editingServicio ? 'Editar Servicio' : 'Nuevo Servicio'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nombre del Servicio *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Destape de Drenaje / Pintura Exterior"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Categoría
                  </label>
                  <select
                    value={formData.categoria}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        categoria: e.target.value as CategoriaServicio,
                      })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="plomería">Plomería</option>
                    <option value="electricidad">Electricidad</option>
                    <option value="pintura">Pintura</option>
                    <option value="otros">Otros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Unidad
                  </label>
                  <select
                    value={formData.unidad}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        unidad: e.target.value as UnidadServicio,
                      })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="servicio">Servicio completo</option>
                    <option value="hora">Por Hora</option>
                    <option value="unidad">Por Unidad</option>
                    <option value="m²">Por M²</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Precio Base (RD$) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  required
                  value={formData.precio_base}
                  onChange={(e) =>
                    setFormData({ ...formData, precio_base: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-bold text-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  placeholder="Detalles incluidos en el servicio..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Guardar Servicio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
