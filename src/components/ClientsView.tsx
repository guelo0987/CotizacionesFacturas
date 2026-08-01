import React, { useEffect, useMemo, useState } from 'react';
import type { AppState, Cliente } from '../types';
import type { SolicitudApertura } from '../App';
import { formatCurrency, formatDate, formatDocumento, formatTelefono } from '../utils/sanitizer';
import {
  limpiarTexto,
  limpiarTextoMultilinea,
  primerError,
  soloDigitos,
  validarDocumento,
  validarEmail,
  validarNombre,
  validarTelefono,
} from '../utils/validacion';
import { FRECUENCIAS, frecuenciaSegura, modalidadSegura } from '../utils/calculos';
import { useAccionAsync } from '../hooks/useAccionAsync';
import {
  AlertCircle,
  Building,
  Edit2,
  EyeOff,
  FileText,
  Landmark,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';

interface ClientsViewProps {
  state: AppState;
  solicitud: SolicitudApertura | null;
  onAddCliente: (cliente: Omit<Cliente, 'id' | 'created_at' | 'activo'>) => Promise<void>;
  onUpdateCliente: (cliente: Cliente) => Promise<void>;
  onDeleteCliente: (id: string) => Promise<void>;
}

const FORM_VACIO = {
  nombre: '',
  telefono: '',
  email: '',
  direccion: '',
  documento: '',
  notas: '',
};

export const ClientsView: React.FC<ClientsViewProps> = ({
  state,
  solicitud,
  onAddCliente,
  onUpdateCliente,
  onDeleteCliente,
}) => {
  const [search, setSearch] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState(FORM_VACIO);
  const [errorForm, setErrorForm] = useState('');

  const { ejecutando, ejecutar } = useAccionAsync();

  // El detalle se deriva del estado: si el cliente cambia, la ficha se
  // actualiza sola en vez de mostrar una copia congelada.
  const selectedCliente = useMemo(
    () => state.clientes.find((c) => c.id === selectedClienteId) ?? null,
    [state.clientes, selectedClienteId]
  );

  const openCreateModal = React.useCallback(() => {
    setEditingCliente(null);
    setFormData(FORM_VACIO);
    setErrorForm('');
    setIsModalOpen(true);
  }, []);

  // Apertura desde las acciones rápidas del panel
  useEffect(() => {
    if (solicitud?.destino === 'cliente') openCreateModal();
  }, [solicitud, openCreateModal]);

  const filteredClientes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.clientes.filter((c) => {
      if (!c.activo && !mostrarInactivos) return false;
      if (!q) return true;
      return (
        c.nombre.toLowerCase().includes(q) ||
        soloDigitos(c.telefono).includes(soloDigitos(q)) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        soloDigitos(c.documento).includes(soloDigitos(q))
      );
    });
  }, [state.clientes, search, mostrarInactivos]);

  const inactivos = state.clientes.filter((c) => !c.activo).length;

  const openEditModal = (cliente: Cliente, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCliente(cliente);
    setFormData({
      nombre: cliente.nombre ?? '',
      telefono: cliente.telefono ?? '',
      email: cliente.email ?? '',
      direccion: cliente.direccion ?? '',
      documento: cliente.documento ?? '',
      notas: cliente.notas ?? '',
    });
    setErrorForm('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nombre = limpiarTexto(formData.nombre, 160);
    const documento = soloDigitos(formData.documento);
    const telefono = soloDigitos(formData.telefono);
    const email = limpiarTexto(formData.email, 254).toLowerCase();

    const fallo = primerError(
      validarNombre(nombre, 'El nombre del cliente'),
      validarTelefono(telefono),
      validarEmail(email),
      validarDocumento(documento)
    );
    if (fallo) {
      setErrorForm(fallo);
      return;
    }

    // Un mismo RNC o cédula no puede estar dos veces en el directorio
    if (documento) {
      const duplicado = state.clientes.find(
        (c) => soloDigitos(c.documento) === documento && c.id !== editingCliente?.id
      );
      if (duplicado) {
        setErrorForm(`Ya existe un cliente con ese RNC o cédula: ${duplicado.nombre}.`);
        return;
      }
    }

    const saneado = {
      nombre,
      telefono,
      email,
      direccion: limpiarTexto(formData.direccion, 250),
      documento,
      notas: limpiarTextoMultilinea(formData.notas, 1000),
    };

    const ok = await ejecutar(async () => {
      if (editingCliente) {
        await onUpdateCliente({ ...editingCliente, ...saneado });
      } else {
        await onAddCliente(saneado);
      }
    });

    if (ok) setIsModalOpen(false);
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" /> Clientes
          </h2>
          <p className="text-sm text-slate-500">
            Directorio de clientes y ficha de historial financiero.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition-all"
        >
          <Plus className="w-4 h-4" /> Nuevo cliente
        </button>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono, RNC o cédula…"
            className="w-full bg-white shadow-sm border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {inactivos > 0 ? (
          <button
            onClick={() => setMostrarInactivos((v) => !v)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1.5"
          >
            <EyeOff className="w-3.5 h-3.5" />
            {mostrarInactivos
              ? 'Ocultar clientes desactivados'
              : `Mostrar ${inactivos} cliente${inactivos === 1 ? '' : 's'} desactivado${inactivos === 1 ? '' : 's'}`}
          </button>
        ) : null}
      </div>

      {filteredClientes.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">
            {search ? 'No se encontraron clientes con ese criterio.' : 'Aún no hay clientes.'}
          </p>
          {!search ? (
            <button
              onClick={openCreateModal}
              className="mt-3 text-sm text-emerald-600 font-semibold hover:underline"
            >
              + Agregar el primer cliente
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredClientes.map((cliente) => {
            const clientFacturas = state.facturas.filter((f) => f.cliente_id === cliente.id);
            const totalDeuda = clientFacturas.reduce((acc, f) => acc + (f.saldo_pendiente || 0), 0);
            const clientPrestamos = state.prestamos.filter((p) => p.cliente_id === cliente.id);

            return (
              <div
                key={cliente.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedClienteId(cliente.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedClienteId(cliente.id);
                  }
                }}
                className={`bg-white border rounded-2xl p-4 cursor-pointer transition-all hover:border-emerald-500 shadow-sm group ${
                  cliente.activo ? 'border-slate-200' : 'border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="space-y-0.5 min-w-0">
                    <h3 className="font-bold text-slate-800 text-sm group-hover:text-emerald-700 transition-colors truncate">
                      {cliente.nombre}
                      {!cliente.activo ? (
                        <span className="ml-2 text-[10px] font-bold uppercase text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                          Desactivado
                        </span>
                      ) : null}
                    </h3>
                    {cliente.documento ? (
                      <p className="text-xs text-slate-500 font-mono flex items-center gap-1">
                        <Building className="w-3 h-3 text-slate-400" />
                        {formatDocumento(cliente.documento)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => openEditModal(cliente, e)}
                      className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
                      title="Editar cliente"
                      aria-label={`Editar ${cliente.nombre}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void ejecutar(() => onDeleteCliente(cliente.id));
                      }}
                      className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                      title="Eliminar cliente"
                      aria-label={`Eliminar ${cliente.nombre}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 text-sm mb-3">
                  {cliente.telefono ? (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatTelefono(cliente.telefono)}</span>
                    </div>
                  ) : null}
                  {cliente.email ? (
                    <div className="flex items-center gap-2 text-slate-500 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{cliente.email}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-sm gap-2">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500 font-medium">
                      {clientFacturas.length}{' '}
                      {clientFacturas.length === 1 ? 'factura' : 'facturas'}
                    </span>
                    <span className="text-slate-500 font-medium">
                      {clientPrestamos.length}{' '}
                      {clientPrestamos.length === 1 ? 'préstamo' : 'préstamos'}
                    </span>
                  </div>

                  {totalDeuda > 0 ? (
                    <span className="font-bold text-amber-700 text-xs bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 shrink-0">
                      Debe {formatCurrency(totalDeuda)}
                    </span>
                  ) : (
                    <span className="text-emerald-700 text-xs font-semibold shrink-0">Al día</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={openCreateModal}
        className="fixed bottom-20 right-4 sm:right-8 z-30 w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-2xl shadow-emerald-600/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        title="Crear cliente"
        aria-label="Crear cliente"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Formulario */}
      {isModalOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingCliente ? 'Editar cliente' : 'Nuevo cliente'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
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
                <label htmlFor="cli-nombre" className="block text-sm font-semibold text-slate-700 mb-1">
                  Nombre completo o empresa *
                </label>
                <input
                  id="cli-nombre"
                  type="text"
                  maxLength={160}
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Doña Carmen / Colmado La Fe"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="cli-tel" className="block text-sm font-semibold text-slate-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    id="cli-tel"
                    type="tel"
                    inputMode="tel"
                    value={formatTelefono(formData.telefono)}
                    onChange={(e) =>
                      setFormData({ ...formData, telefono: soloDigitos(e.target.value).slice(0, 11) })
                    }
                    placeholder="(809) 000-0000"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label htmlFor="cli-doc" className="block text-sm font-semibold text-slate-700 mb-1">
                    RNC / Cédula
                  </label>
                  <input
                    id="cli-doc"
                    type="text"
                    inputMode="numeric"
                    value={formatDocumento(formData.documento)}
                    onChange={(e) =>
                      setFormData({ ...formData, documento: soloDigitos(e.target.value).slice(0, 11) })
                    }
                    placeholder="001-0000000-0"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cli-email" className="block text-sm font-semibold text-slate-700 mb-1">
                  Correo electrónico
                </label>
                <input
                  id="cli-email"
                  type="email"
                  maxLength={254}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="cliente@ejemplo.com"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="cli-dir" className="block text-sm font-semibold text-slate-700 mb-1">
                  Dirección
                </label>
                <input
                  id="cli-dir"
                  type="text"
                  maxLength={250}
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  placeholder="Calle, sector, ciudad"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="cli-notas" className="block text-sm font-semibold text-slate-700 mb-1">
                  Notas
                </label>
                <textarea
                  id="cli-notas"
                  rows={2}
                  maxLength={1000}
                  value={formData.notas}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                  placeholder="Detalles o preferencias del cliente…"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ejecutando}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white shadow-md shadow-emerald-600/20 transition-colors"
                >
                  {ejecutando ? 'Guardando…' : editingCliente ? 'Guardar cambios' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Ficha del cliente */}
      {selectedCliente ? (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col my-8">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Ficha de cliente
                </span>
                {/* Antes este título era `text-white` sobre fondo blanco: invisible */}
                <h3 className="text-lg font-bold text-slate-900 truncate">
                  {selectedCliente.nombre}
                </h3>
                {selectedCliente.documento ? (
                  <p className="text-sm text-slate-500 font-mono">
                    RNC/Cédula: {formatDocumento(selectedCliente.documento)}
                  </p>
                ) : null}
              </div>
              <button
                onClick={() => setSelectedClienteId(null)}
                className="text-slate-400 hover:text-slate-700 p-1 shrink-0"
                aria-label="Cerrar ficha"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block text-[11px]">Teléfono</span>
                  <span className="font-semibold text-slate-700">
                    {selectedCliente.telefono ? formatTelefono(selectedCliente.telefono) : '—'}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="text-slate-500 block text-[11px]">Correo</span>
                  <span className="font-semibold text-slate-700 truncate block">
                    {selectedCliente.email || '—'}
                  </span>
                </div>
                <div className="col-span-2 pt-1">
                  <span className="text-slate-500 block text-[11px]">Dirección</span>
                  <span className="font-medium text-slate-600">
                    {selectedCliente.direccion || 'No especificada'}
                  </span>
                </div>
                {selectedCliente.notas ? (
                  <div className="col-span-2 pt-1">
                    <span className="text-slate-500 block text-[11px]">Notas</span>
                    <span className="font-medium text-slate-600 whitespace-pre-line">
                      {selectedCliente.notas}
                    </span>
                  </div>
                ) : null}
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-600" /> Facturas emitidas
                </h4>
                {state.facturas.filter((f) => f.cliente_id === selectedCliente.id).length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Sin facturas registradas.</p>
                ) : (
                  <div className="space-y-1.5">
                    {state.facturas
                      .filter((f) => f.cliente_id === selectedCliente.id)
                      .map((fac) => (
                        <div
                          key={fac.id}
                          className="bg-white p-2.5 rounded-xl flex items-center justify-between text-sm border border-slate-200"
                        >
                          <div>
                            <span className="font-bold text-slate-800">{fac.numero}</span>
                            <span className="text-slate-400 text-[11px] ml-2">
                              {formatDate(fac.fecha)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-800 block">
                              {formatCurrency(fac.total)}
                            </span>
                            {fac.saldo_pendiente > 0 ? (
                              <span className="text-[11px] text-amber-700 font-semibold">
                                Debe {formatCurrency(fac.saldo_pendiente)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-emerald-700 font-semibold">
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
                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Landmark className="w-4 h-4 text-emerald-600" /> Préstamos asociados
                </h4>
                {state.prestamos.filter((p) => p.cliente_id === selectedCliente.id).length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Sin préstamos registrados.</p>
                ) : (
                  <div className="space-y-1.5">
                    {state.prestamos
                      .filter((p) => p.cliente_id === selectedCliente.id)
                      .map((pres) => (
                        <div
                          key={pres.id}
                          className="bg-white p-2.5 rounded-xl flex items-center justify-between text-sm border border-slate-200"
                        >
                          <div>
                            <span className="font-bold text-slate-800">
                              {formatCurrency(pres.monto_prestado)}
                            </span>
                            <span className="text-slate-400 text-[11px] block">
                              {pres.num_cuotas} cuotas{' '}
                              {FRECUENCIAS[frecuenciaSegura(pres.frecuencia)].plural}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-emerald-700 block">
                              Total: {formatCurrency(pres.total_a_pagar)}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Tasa {pres.tasa_interes}%{' '}
                              {modalidadSegura(pres.modalidad_interes) === 'fijo_total'
                                ? 'único'
                                : FRECUENCIAS[frecuenciaSegura(pres.frecuencia)].adjetivo}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 text-right">
              <button
                onClick={() => setSelectedClienteId(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl border border-slate-200"
              >
                Cerrar ficha
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
