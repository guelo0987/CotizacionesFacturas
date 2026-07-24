import React, { useState } from 'react';
import type { AppState, Prestamo, Cuota, FrecuenciaPrestamo, Cliente } from '../types';
import { formatCurrency, formatDate, addDaysToDate, roundMoney } from '../utils/sanitizer';
import { generateWhatsappLoanCuotaUrl } from '../utils/whatsapp';

import {
  Landmark,
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  Share2,
  ChevronRight,
  X,
  TrendingUp,
} from 'lucide-react';

interface LoansViewProps {
  state: AppState;
  onAddPrestamo: (prestamo: Omit<Prestamo, 'id' | 'created_at'>) => void;
  onUpdateCuotaEstado: (prestamoId: string, cuotaId: string, montoPagado: number) => void;
  onDeletePrestamo: (id: string) => void;
}

export const LoansView: React.FC<LoansViewProps> = ({
  state,
  onAddPrestamo,
  onUpdateCuotaEstado,
  onDeletePrestamo,
}) => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPrestamo, setSelectedPrestamo] = useState<Prestamo | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    cliente_id: state.clientes[0]?.id || '',
    monto_prestado: 10000,
    tasa_interes: 10,
    num_cuotas: 4,
    frecuencia: 'quincenal' as FrecuenciaPrestamo,
    fecha_inicio: new Date().toISOString().split('T')[0],
  });

  // Live calculation values
  const montoPrestado = Number(formData.monto_prestado) || 0;
  const tasaInteres = Number(formData.tasa_interes) || 0;
  const numCuotas = Math.max(1, Number(formData.num_cuotas) || 1);

  const interesTotalLive = roundMoney(montoPrestado * (tasaInteres / 100));
  const totalAPagarLive = roundMoney(montoPrestado + interesTotalLive);
  const cuotaBaseLive = roundMoney(totalAPagarLive / numCuotas);

  const openCreateModal = () => {
    setFormData({
      cliente_id: state.clientes[0]?.id || '',
      monto_prestado: 10000,
      tasa_interes: 10,
      num_cuotas: 4,
      frecuencia: 'quincenal',
      fecha_inicio: new Date().toISOString().split('T')[0],
    });
    setIsModalOpen(true);
  };

  const handleCreatePrestamo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.cliente_id || montoPrestado <= 0) {
      alert('Por favor completa todos los campos correctamente.');
      return;
    }

    const daysStep =
      formData.frecuencia === 'semanal' ? 7 : formData.frecuencia === 'quincenal' ? 15 : 30;

    const cuotas: Cuota[] = [];
    let acumulado = 0;

    for (let i = 1; i <= numCuotas; i++) {
      let montoCuota = cuotaBaseLive;
      if (i === numCuotas) {
        montoCuota = roundMoney(totalAPagarLive - acumulado);
      } else {
        acumulado = roundMoney(acumulado + cuotaBaseLive);
      }

      const fechaVenc = addDaysToDate(formData.fecha_inicio, daysStep * i);

      cuotas.push({
        id: `cuota-${Date.now()}-${i}`,
        prestamo_id: '',
        numero: i,
        fecha_vencimiento: fechaVenc,
        monto: montoCuota,
        monto_pagado: 0,
        estado: 'pendiente',
      });
    }

    const payload: Omit<Prestamo, 'id' | 'created_at'> = {
      cliente_id: formData.cliente_id,
      monto_prestado: montoPrestado,
      tasa_interes: tasaInteres,
      interes_total: interesTotalLive,
      total_a_pagar: totalAPagarLive,
      num_cuotas: numCuotas,
      frecuencia: formData.frecuencia,
      fecha_inicio: formData.fecha_inicio,
      estado: 'activo',
      cuotas,
    };

    onAddPrestamo(payload);
    setIsModalOpen(false);
  };

  const filteredPrestamos = state.prestamos.filter((p: Prestamo) => {
    const cli = state.clientes.find((c: Cliente) => c.id === p.cliente_id);
    const q = search.toLowerCase();
    return (cli && cli.nombre.toLowerCase().includes(q)) || p.monto_prestado.toString().includes(q);
  });

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-600" /> Préstamos
          </h2>
          <p className="text-sm text-slate-400">
            Control de cuotas, tasa de interés fija y cobranza de préstamos.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition-all"
        >
          <Plus className="w-4 h-4" /> Nuevo Préstamo
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar préstamo por nombre del cliente..."
          className="w-full bg-white shadow-sm border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {filteredPrestamos.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
          <Landmark className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm font-medium">No hay préstamos registrados.</p>
          <button
            onClick={openCreateModal}
            className="mt-3 text-sm text-emerald-600 font-semibold hover:underline"
          >
            + Conceder el primer préstamo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPrestamos.map((prestamo: Prestamo) => {
            const cli = state.clientes.find((c: Cliente) => c.id === prestamo.cliente_id);

            const totalPagado =
              prestamo.cuotas?.reduce((acc: number, c: Cuota) => acc + (c.monto_pagado || 0), 0) || 0;
            const progressPercent = Math.min(
              100,
              roundMoney((totalPagado / prestamo.total_a_pagar) * 100)
            );

            const cuotasAtrasadas =
              prestamo.cuotas?.filter((c: Cuota) => {
                const isOverdue =
                  c.estado !== 'pagada' &&
                  new Date(c.fecha_vencimiento).getTime() < new Date().setHours(0, 0, 0, 0);
                return isOverdue;
              }) || [];

            return (
              <div
                key={prestamo.id}
                onClick={() => setSelectedPrestamo(prestamo)}
                className="bg-white shadow-sm hover:bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer transition-all hover:border-emerald-500 shadow-sm space-y-3 group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm group-hover:text-emerald-700 transition-colors">
                      {cli?.nombre || 'Cliente sin asignar'}
                    </h3>
                    <p className="text-sm text-slate-400 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      Inicio: {formatDate(prestamo.fecha_inicio)} · {prestamo.num_cuotas} cuotas (
                      {prestamo.frecuencia})
                    </p>
                  </div>

                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                      progressPercent >= 100
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-500/30'
                        : cuotasAtrasadas.length > 0
                        ? 'bg-red-50 text-red-600 border-red-500/30'
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                    }`}
                  >
                    {progressPercent >= 100
                      ? 'SALDADO'
                      : cuotasAtrasadas.length > 0
                      ? `${cuotasAtrasadas.length} ATRASO(S)`
                      : 'AL DÍA'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-white/60 p-2.5 rounded-xl text-sm border border-slate-200">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Prestado</span>
                    <span className="font-bold text-slate-700">
                      {formatCurrency(prestamo.monto_prestado)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Tasa ({prestamo.tasa_interes}%)</span>
                    <span className="font-bold text-blue-400">
                      +{formatCurrency(prestamo.interes_total)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Total a Pagar</span>
                    <span className="font-black text-emerald-600">
                      {formatCurrency(prestamo.total_a_pagar)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-400">Progreso del Saldo</span>
                    <span className="text-emerald-600">
                      {formatCurrency(totalPagado)} / {formatCurrency(prestamo.total_a_pagar)} (
                      {progressPercent.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-slate-100">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-emerald-600 font-semibold pt-1">
                  <span>Ver calendario de cuotas y pagos</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={openCreateModal}
        className="fixed bottom-20 right-4 sm:right-8 z-30 w-14 h-14 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-2xl shadow-emerald-600/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        title="Crear Préstamo"
      >
        <Plus className="w-7 h-7" />
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-800">Nuevo Préstamo</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePrestamo} className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  Cliente Deudor *
                </label>
                <select
                  required
                  value={formData.cliente_id}
                  onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {state.clientes.map((c: Cliente) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">
                    Monto Prestado (RD$) *
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="500"
                    required
                    value={formData.monto_prestado}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        monto_prestado: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">
                    Tasa de Interés (%) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    required
                    value={formData.tasa_interes}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tasa_interes: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-blue-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">
                    Número de Cuotas *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={formData.num_cuotas}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        num_cuotas: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">
                    Frecuencia *
                  </label>
                  <select
                    value={formData.frecuencia}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        frecuencia: e.target.value as FrecuenciaPrestamo,
                      })
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none"
                  >
                    <option value="semanal">Semanal (cada 7 días)</option>
                    <option value="quincenal">Quincenal (cada 15 días)</option>
                    <option value="mensual">Mensual (cada 30 días)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  Fecha de Inicio
                </label>
                <input
                  type="date"
                  required
                  value={formData.fecha_inicio}
                  onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none"
                />
              </div>

              <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-emerald-500/30 rounded-xl p-3.5 space-y-1.5 shadow-inner">
                <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-600 uppercase tracking-wider mb-1">
                  <TrendingUp className="w-4 h-4" /> Resumen en Vivo del Préstamo
                </div>

                <div className="flex justify-between text-sm text-slate-600">
                  <span>Interés total ({tasaInteres}%):</span>
                  <span className="font-bold text-blue-400">
                    {formatCurrency(interesTotalLive)}
                  </span>
                </div>

                <div className="flex justify-between text-sm text-slate-600">
                  <span>Total a Pagar:</span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(totalAPagarLive)}
                  </span>
                </div>

                <div className="flex justify-between text-sm font-black text-emerald-600 pt-1.5 border-t border-slate-200">
                  <span>Cuota ({numCuotas}x):</span>
                  <span>{formatCurrency(cuotaBaseLive)} / cuota</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20"
                >
                  Generar Préstamo y Cuotas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedPrestamo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                  Detalle del Préstamo
                </span>
                <h3 className="text-base font-bold text-white">
                  {state.clientes.find((c: Cliente) => c.id === selectedPrestamo.cliente_id)?.nombre ||
                    'Cliente'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPrestamo(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              <div className="bg-white shadow-sm p-3 rounded-xl border border-slate-100 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-400 text-[11px] block">Monto Prestado</span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(selectedPrestamo.monto_prestado)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Total a Pagar</span>
                  <span className="font-bold text-emerald-600">
                    {formatCurrency(selectedPrestamo.total_a_pagar)}
                  </span>
                </div>
              </div>

              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wider">
                Calendario de Cuotas ({selectedPrestamo.cuotas?.length || 0})
              </h4>

              <div className="space-y-2">
                {selectedPrestamo.cuotas?.map((cuota: Cuota) => {
                  const isOverdue =
                    cuota.estado !== 'pagada' &&
                    new Date(cuota.fecha_vencimiento).getTime() < new Date().setHours(0, 0, 0, 0);

                  const cli = state.clientes.find((c: Cliente) => c.id === selectedPrestamo.cliente_id);
                  const whatsappReminderUrl = generateWhatsappLoanCuotaUrl(
                    selectedPrestamo,
                    cuota,
                    cli,
                    state.settings
                  );

                  return (
                    <div
                      key={cuota.id}
                      className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                        cuota.estado === 'pagada'
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : isOverdue
                          ? 'bg-red-950/20 border-red-500/30'
                          : 'bg-white shadow-sm border-slate-200/70'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">
                            Cuota #{cuota.numero}
                          </span>
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              cuota.estado === 'pagada'
                                ? 'bg-emerald-100 text-emerald-600 border-emerald-500/30'
                                : isOverdue
                                ? 'bg-red-500/20 text-red-600 border-red-500/30'
                                : 'bg-amber-500/20 text-amber-600 border-amber-500/30'
                            }`}
                          >
                            {cuota.estado === 'pagada'
                              ? 'PAGADA'
                              : isOverdue
                              ? 'ATRASADA'
                              : 'PENDIENTE'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          Vence: {formatDate(cuota.fecha_vencimiento)}
                        </p>
                      </div>

                      <div className="text-right space-y-1">
                        <span className="font-black text-slate-800 text-sm block">
                          {formatCurrency(cuota.monto)}
                        </span>

                        <div className="flex items-center justify-end gap-1.5">
                          {cuota.estado !== 'pagada' ? (
                            <button
                              onClick={() =>
                                onUpdateCuotaEstado(selectedPrestamo.id, cuota.id, cuota.monto)
                              }
                              className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg text-[11px] transition-all shadow-sm"
                            >
                              Registrar Pago
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Pagada
                            </span>
                          )}

                          <a
                            href={whatsappReminderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-emerald-600 hover:text-emerald-300 bg-emerald-50 rounded-md border border-emerald-500/30"
                            title="Recordatorio WhatsApp"
                          >
                            <Share2 className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm">
              <button
                onClick={() => {
                  if (confirm('¿Eliminar este préstamo?')) {
                    onDeletePrestamo(selectedPrestamo.id);
                    setSelectedPrestamo(null);
                  }
                }}
                className="text-red-600 hover:underline"
              >
                Eliminar Préstamo
              </button>

              <button
                onClick={() => setSelectedPrestamo(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
