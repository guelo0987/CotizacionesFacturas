import React, { useState } from 'react';
import type { AppState, Cliente } from '../types';
import { sanitizeString, formatCurrency, formatDocumento, formatTelefono, formatDate } from '../utils/sanitizer';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  FileText,
  Edit2,
  Trash2,
  X,
  Landmark,
  Building,
} from 'lucide-react';

interface ClientsViewProps {
  state: AppState;
  onAddCliente: (cliente: Omit<Cliente, 'id' | 'created_at'>) => void;
  onUpdateCliente: (cliente: Cliente) => void;
  onDeleteCliente: (id: string) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  state,
  onAddCliente,
  onUpdateCliente,
  onDeleteCliente,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);

  const [formData, setFormData] = useState({
    nombre: '',
    telefono: '',
    email: '',
    direccion: '',
    documento: '',
    notas: '',
  });

  const filteredClientes = state.clientes.filter((c: Cliente) => {
    const q = search.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(q) ||
      c.telefono?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.documento?.toLowerCase().includes(q)
    );
  });

  const openCreateModal = () => {
    setEditingCliente(null);
    setFormData({
      nombre: '',
      telefono: '',
      email: '',
      direccion: '',
      documento: '',
      notas: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (cliente: Cliente, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCliente(cliente);
    setFormData({
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      email: cliente.email,
      direccion: cliente.direccion,
      documento: cliente.documento,
      notas: cliente.notas,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;

    const sanitized = {
      nombre: sanitizeString(formData.nombre),
      telefono: sanitizeString(formData.telefono),
      email: sanitizeString(formData.email),
      direccion: sanitizeString(formData.direccion),
      documento: sanitizeString(formData.documento),
      notas: sanitizeString(formData.notas),
    };

    if (editingCliente) {
      onUpdateCliente({
        ...editingCliente,
        ...sanitized,
      });
    } else {
      onAddCliente(sanitized);
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" /> Clientes
          </h2>
          <p className="text-xs text-slate-400">
            Directorio de clientes y ficha de historial financiero.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-emerald-900/30 transition-all"
        >
          <Plus className="w-4 h-4" /> Nuevo Cliente
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono, RNC o cédula..."
          className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
        />
      </div>

      {filteredClientes.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8 text-center">
          <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm font-medium">No se encontraron clientes.</p>
          <button
            onClick={openCreateModal}
            className="mt-3 text-xs text-emerald-400 font-semibold hover:underline"
          >
            + Agregar el primer cliente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredClientes.map((cliente: Cliente) => {
            const clientFacturas = state.facturas.filter((f) => f.cliente_id === cliente.id);
            const totalDeuda = clientFacturas.reduce((acc, f) => acc + (f.saldo_pendiente || 0), 0);
            const clientPrestamos = state.prestamos.filter((p) => p.cliente_id === cliente.id);

            return (
              <div
                key={cliente.id}
                onClick={() => setSelectedCliente(cliente)}
                className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-2xl p-4 cursor-pointer transition-all hover:border-slate-600 shadow-sm relative group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-slate-100 text-sm group-hover:text-emerald-400 transition-colors">
                      {cliente.nombre}
                    </h3>
                    {cliente.documento && (
                      <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                        <Building className="w-3 h-3 text-slate-500" />
                        RNC/Cédula: {formatDocumento(cliente.documento)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => openEditModal(cliente, e)}
                      className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`¿Eliminar al cliente ${cliente.nombre}?`)) {
                          onDeleteCliente(cliente.id);
                        }
                      }}
                      className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-300 mb-3">
                  {cliente.telefono && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{formatTelefono(cliente.telefono)}</span>
                    </div>
                  )}
                  {cliente.email && (
                    <div className="flex items-center gap-2 text-slate-400 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span className="truncate">{cliente.email}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-700/60 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 font-medium">
                      {clientFacturas.length} facturas
                    </span>
                    <span className="text-slate-400 font-medium">
                      {clientPrestamos.length} préstamos
                    </span>
                  </div>

                  {totalDeuda > 0 ? (
                    <span className="font-bold text-amber-400 text-xs bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                      Deuda: {formatCurrency(totalDeuda)}
                    </span>
                  ) : (
                    <span className="text-emerald-400 text-[11px] font-semibold">Al día</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={openCreateModal}
        className="fixed bottom-20 right-4 sm:right-8 z-30 w-14 h-14 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-2xl shadow-emerald-900/60 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        title="Crear Cliente"
      >
        <Plus className="w-7 h-7" />
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">
                {editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nombre Completo / Empresa *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Doña Carmen / Colmado La Fe"
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
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    placeholder="(809) 000-0000"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    RNC / Cédula
                  </label>
                  <input
                    type="text"
                    value={formData.documento}
                    onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
                    placeholder="001-0000000-0"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
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
                  placeholder="cliente@ejemplo.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Dirección
                </label>
                <input
                  type="text"
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  placeholder="Calle, Sector, Ciudad"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notas</label>
                <textarea
                  rows={2}
                  value={formData.notas}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                  placeholder="Detalles o preferencias del cliente..."
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
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/40"
                >
                  {editingCliente ? 'Guardar Cambios' : 'Crear Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedCliente && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Ficha de Cliente
                </span>
                <h3 className="text-lg font-bold text-white">{selectedCliente.nombre}</h3>
                {selectedCliente.documento && (
                  <p className="text-xs text-slate-400 font-mono">
                    RNC/Cédula: {formatDocumento(selectedCliente.documento)}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedCliente(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                <div>
                  <span className="text-slate-400 block text-[10px]">Teléfono</span>
                  <span className="font-semibold text-slate-200">
                    {selectedCliente.telefono ? formatTelefono(selectedCliente.telefono) : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Correo</span>
                  <span className="font-semibold text-slate-200 truncate block">
                    {selectedCliente.email || 'N/A'}
                  </span>
                </div>
                <div className="col-span-2 pt-1">
                  <span className="text-slate-400 block text-[10px]">Dirección</span>
                  <span className="font-medium text-slate-300">
                    {selectedCliente.direccion || 'No especificada'}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-amber-400" /> Facturas Emitidas
                </h4>
                {state.facturas.filter((f) => f.cliente_id === selectedCliente.id).length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Sin facturas registradas.</p>
                ) : (
                  <div className="space-y-1.5">
                    {state.facturas
                      .filter((f) => f.cliente_id === selectedCliente.id)
                      .map((fac) => (
                        <div
                          key={fac.id}
                          className="bg-slate-800/80 p-2.5 rounded-xl flex items-center justify-between text-xs border border-slate-700/50"
                        >
                          <div>
                            <span className="font-bold text-slate-100">{fac.numero}</span>
                            <span className="text-slate-400 text-[10px] ml-2">
                              {formatDate(fac.fecha)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-100 block">
                              {formatCurrency(fac.total)}
                            </span>
                            {fac.saldo_pendiente > 0 ? (
                              <span className="text-[10px] text-amber-400 font-semibold">
                                Debe {formatCurrency(fac.saldo_pendiente)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-400 font-semibold">
                                Pagada
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Landmark className="w-4 h-4 text-emerald-400" /> Préstamos Asociados
                </h4>
                {state.prestamos.filter((p) => p.cliente_id === selectedCliente.id).length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Sin préstamos activos.</p>
                ) : (
                  <div className="space-y-1.5">
                    {state.prestamos
                      .filter((p) => p.cliente_id === selectedCliente.id)
                      .map((pres) => (
                        <div
                          key={pres.id}
                          className="bg-slate-800/80 p-2.5 rounded-xl flex items-center justify-between text-xs border border-slate-700/50"
                        >
                          <div>
                            <span className="font-bold text-slate-100">
                              {formatCurrency(pres.monto_prestado)}
                            </span>
                            <span className="text-slate-400 text-[10px] block">
                              {pres.num_cuotas} cuotas ({pres.frecuencia})
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-emerald-400 block">
                              Total: {formatCurrency(pres.total_a_pagar)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Tasa {pres.tasa_interes}%
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-right">
              <button
                onClick={() => setSelectedCliente(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
