import React, { useState } from 'react';
import type {
  AppState,
  Cotizacion,
  Factura,
  CotizacionItem,
  FacturaItem,
  MetodoPago,
  Cliente,
  Servicio,
} from '../types';
import { sanitizeString, formatCurrency, formatDate, roundMoney } from '../utils/sanitizer';
import { generateWhatsappQuoteUrl, generateWhatsappInvoiceUrl } from '../utils/whatsapp';

import {
  FileText,
  Plus,
  Search,
  ArrowRightLeft,
  Share2,
  DollarSign,
  Calendar,
  CheckCircle2,
  Trash2,
  X,
  Eye,
} from 'lucide-react';

interface DocumentsViewProps {
  state: AppState;
  onAddCotizacion: (cotizacion: Omit<Cotizacion, 'id' | 'created_at'>) => void;
  onUpdateCotizacion: (cotizacion: Cotizacion) => void;
  onDeleteCotizacion: (id: string) => void;
  onAddFactura: (factura: Omit<Factura, 'id' | 'created_at'>) => void;
  onUpdateFactura: (factura: Factura) => void;
  onDeleteFactura: (id: string) => void;
  onRegisterPago: (pago: { factura_id: string; monto: number; metodo: MetodoPago; referencia?: string }) => void;
  onOpenPdfPreview: (type: 'cotizacion' | 'factura', doc: Cotizacion | Factura) => void;
  initialSubTab?: 'cotizaciones' | 'facturas';
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  state,
  onAddCotizacion,
  onUpdateCotizacion,
  onDeleteCotizacion,
  onAddFactura,
  onUpdateFactura,
  onDeleteFactura,
  onRegisterPago,
  onOpenPdfPreview,
  initialSubTab = 'cotizaciones',
}) => {
  const [subTab, setSubTab] = useState<'cotizaciones' | 'facturas'>(initialSubTab);
  const [search, setSearch] = useState('');

  // Modals
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [editingCotizacion, setEditingCotizacion] = useState<Cotizacion | null>(null);
  const [editingFactura, setEditingFactura] = useState<Factura | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentFactura, setPaymentFactura] = useState<Factura | null>(null);
  const [paymentMonto, setPaymentMonto] = useState<number>(0);
  const [paymentMetodo, setPaymentMetodo] = useState<MetodoPago>('efectivo');
  const [paymentRef, setPaymentRef] = useState<string>('');

  // Document Form State
  const [formData, setFormData] = useState({
    cliente_id: '',
    numero: '',
    ncf: '',
    fecha: new Date().toISOString().split('T')[0],
    validez_dias: 15,
    aplica_itbis: true,
    notas: '',
    items: [
      { descripcion: '', cantidad: 1, precio_unitario: 0, importe: 0 },
    ] as (CotizacionItem | FacturaItem)[],
  });

  // Calculate numbers
  const nextCotNumero = `COT-2026-${String(state.cotizaciones.length + 1).padStart(4, '0')}`;
  const nextFacNumero = `FAC-2026-${String(state.facturas.length + 1).padStart(4, '0')}`;

  const openCreateQuoteModal = () => {
    setEditingCotizacion(null);
    setEditingFactura(null);
    setFormData({
      cliente_id: state.clientes[0]?.id || '',
      numero: nextCotNumero,
      ncf: '',
      fecha: new Date().toISOString().split('T')[0],
      validez_dias: 15,
      aplica_itbis: true,
      notas: '',
      items: [{ id: 'item-1', descripcion: '', cantidad: 1, precio_unitario: 0, importe: 0 }],
    });
    setIsDocModalOpen(true);
  };

  const openCreateInvoiceModal = () => {
    setEditingCotizacion(null);
    setEditingFactura(null);
    setFormData({
      cliente_id: state.clientes[0]?.id || '',
      numero: nextFacNumero,
      ncf: '',
      fecha: new Date().toISOString().split('T')[0],
      validez_dias: 15,
      aplica_itbis: true,
      notas: '',
      items: [{ id: 'item-1', descripcion: '', cantidad: 1, precio_unitario: 0, importe: 0 }],
    });
    setIsDocModalOpen(true);
  };

  const handleConvertQuoteToInvoice = (cot: Cotizacion) => {
    onUpdateCotizacion({ ...cot, estado: 'aceptada' });

    setEditingCotizacion(null);
    setEditingFactura(null);
    setSubTab('facturas');
    setFormData({
      cliente_id: cot.cliente_id,
      numero: nextFacNumero,
      ncf: '',
      fecha: new Date().toISOString().split('T')[0],
      validez_dias: 15,
      aplica_itbis: cot.aplica_itbis,
      notas: `Convertida desde ${cot.numero}. ${cot.notas || ''}`,
      items: cot.items?.map((it: CotizacionItem) => ({ ...it, id: undefined })) || [
        { descripcion: '', cantidad: 1, precio_unitario: 0, importe: 0 },
      ],
    });
    setIsDocModalOpen(true);
  };

  const addLineItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        { id: `item-${Date.now()}`, descripcion: '', cantidad: 1, precio_unitario: 0, importe: 0 },
      ],
    });
  };

  const selectServiceForLine = (index: number, serviceId: string) => {
    const s = state.servicios.find((serv: Servicio) => serv.id === serviceId);
    if (!s) return;
    const updated = [...formData.items];
    updated[index] = {
      ...updated[index],
      servicio_id: s.id,
      descripcion: s.nombre,
      precio_unitario: s.precio_base,
      importe: roundMoney(updated[index].cantidad * s.precio_base),
    };
    setFormData({ ...formData, items: updated });
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...formData.items];
    const current = { ...updated[index], [field]: value };

    if (field === 'cantidad' || field === 'precio_unitario') {
      const qty = field === 'cantidad' ? Number(value) : Number(current.cantidad);
      const price = field === 'precio_unitario' ? Number(value) : Number(current.precio_unitario);
      current.importe = roundMoney((qty || 0) * (price || 0));
    }

    updated[index] = current;
    setFormData({ ...formData, items: updated });
  };

  const removeLineItem = (index: number) => {
    if (formData.items.length === 1) return;
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const subtotalCalculado = formData.items.reduce((sum: number, item) => sum + (item.importe || 0), 0);
  const itbisCalculado = formData.aplica_itbis
    ? roundMoney(subtotalCalculado * (state.settings.itbis_rate / 100))
    : 0;
  const totalCalculado = roundMoney(subtotalCalculado + itbisCalculado);

  const handleSubmitDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.cliente_id) {
      alert('Por favor selecciona un cliente');
      return;
    }

    if (subTab === 'cotizaciones') {
      const payload: Omit<Cotizacion, 'id' | 'created_at'> = {
        cliente_id: formData.cliente_id,
        numero: formData.numero || nextCotNumero,
        fecha: formData.fecha,
        validez_dias: formData.validez_dias,
        estado: editingCotizacion ? editingCotizacion.estado : 'borrador',
        subtotal: subtotalCalculado,
        aplica_itbis: formData.aplica_itbis,
        itbis: itbisCalculado,
        total: totalCalculado,
        notas: sanitizeString(formData.notas),
        items: formData.items as CotizacionItem[],
      };

      if (editingCotizacion) {
        onUpdateCotizacion({ ...editingCotizacion, ...payload });
      } else {
        onAddCotizacion(payload);
      }
    } else {
      const payload: Omit<Factura, 'id' | 'created_at'> = {
        cliente_id: formData.cliente_id,
        numero: formData.numero || nextFacNumero,
        ncf: sanitizeString(formData.ncf),
        fecha: formData.fecha,
        estado: editingFactura ? editingFactura.estado : 'pendiente',
        subtotal: subtotalCalculado,
        aplica_itbis: formData.aplica_itbis,
        itbis: itbisCalculado,
        total: totalCalculado,
        monto_pagado: editingFactura ? editingFactura.monto_pagado : 0,
        saldo_pendiente: editingFactura ? editingFactura.saldo_pendiente : totalCalculado,
        notas: sanitizeString(formData.notas),
        items: formData.items as FacturaItem[],
      };

      if (editingFactura) {
        onUpdateFactura({ ...editingFactura, ...payload });
      } else {
        onAddFactura(payload);
      }
    }

    setIsDocModalOpen(false);
  };

  const handleOpenPayment = (fac: Factura) => {
    setPaymentFactura(fac);
    setPaymentMonto(fac.saldo_pendiente);
    setPaymentMetodo('efectivo');
    setPaymentRef('');
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentFactura || paymentMonto <= 0) return;

    onRegisterPago({
      factura_id: paymentFactura.id,
      monto: paymentMonto,
      metodo: paymentMetodo,
      referencia: paymentRef,
    });

    setIsPaymentModalOpen(false);
  };

  const filteredCotizaciones = state.cotizaciones.filter((c: Cotizacion) => {
    const cli = state.clientes.find((cl: Cliente) => cl.id === c.cliente_id);
    const q = search.toLowerCase();
    return c.numero.toLowerCase().includes(q) || (cli && cli.nombre.toLowerCase().includes(q));
  });

  const filteredFacturas = state.facturas.filter((f: Factura) => {
    const cli = state.clientes.find((cl: Cliente) => cl.id === f.cliente_id);
    const q = search.toLowerCase();
    return (
      f.numero.toLowerCase().includes(q) ||
      (f.ncf && f.ncf.toLowerCase().includes(q)) ||
      (cli && cli.nombre.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center bg-white border border-slate-200 p-1.5 rounded-2xl gap-1">
        <button
          onClick={() => setSubTab('cotizaciones')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            subTab === 'cotizaciones'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" /> Cotizaciones ({state.cotizaciones.length})
        </button>

        <button
          onClick={() => setSubTab('facturas')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            subTab === 'facturas'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <DollarSign className="w-4 h-4" /> Facturas ({state.facturas.length})
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar en ${subTab}...`}
            className="w-full bg-white shadow-sm border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          onClick={subTab === 'cotizaciones' ? openCreateQuoteModal : openCreateInvoiceModal}
          className={`flex items-center justify-center gap-2 font-semibold text-sm px-4 py-2.5 rounded-xl shadow-md transition-all text-white ${
            subTab === 'cotizaciones'
              ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/30'
              : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
          }`}
        >
          <Plus className="w-4 h-4" /> + Crear {subTab === 'cotizaciones' ? 'Cotización' : 'Factura'}
        </button>
      </div>

      {subTab === 'cotizaciones' && (
        <div className="space-y-3">
          {filteredCotizaciones.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm font-medium">
                No hay cotizaciones registradas.
              </p>
              <button
                onClick={openCreateQuoteModal}
                className="mt-3 text-sm text-blue-400 font-semibold hover:underline"
              >
                + Crear la primera cotización
              </button>
            </div>
          ) : (
            filteredCotizaciones.map((cot: Cotizacion) => {
              const cli = state.clientes.find((c: Cliente) => c.id === cot.cliente_id);
              const whatsappUrl = generateWhatsappQuoteUrl(cot, cli, state.settings);

              return (
                <div
                  key={cot.id}
                  className="bg-white shadow-sm border border-slate-200 rounded-2xl p-4 transition-all hover:border-emerald-500 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-800 text-sm">{cot.numero}</span>
                        <span
                          className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            cot.estado === 'aceptada'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-500/30'
                              : cot.estado === 'enviada'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              : cot.estado === 'rechazada'
                              ? 'bg-red-50 text-red-600 border-red-500/30'
                              : 'bg-slate-100 text-slate-600 border-slate-600'
                          }`}
                        >
                          {cot.estado}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 font-semibold mt-0.5">
                        {cli?.nombre || 'Cliente sin asignar'}
                      </p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {formatDate(cot.fecha)} · Validez: {cot.validez_dias} días
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-black text-blue-400 block">
                        {formatCurrency(cot.total)}
                      </span>
                      {cot.aplica_itbis && (
                        <span className="text-[11px] text-slate-400">
                          Incluye ITBIS ({formatCurrency(cot.itbis)})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onOpenPdfPreview('cotizacion', cot)}
                        className="flex items-center gap-1 text-slate-600 hover:text-white bg-slate-100/60 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors text-xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-400" /> PDF
                      </button>

                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-emerald-600 hover:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors text-xs font-semibold border border-emerald-500/30"
                      >
                        <Share2 className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {cot.estado !== 'aceptada' && (
                        <button
                          onClick={() => handleConvertQuoteToInvoice(cot)}
                          className="flex items-center gap-1 text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                          title="Convertir a Factura"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" /> Convertir a Factura
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar la cotización ${cot.numero}?`)) {
                            onDeleteCotizacion(cot.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100/50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {subTab === 'facturas' && (
        <div className="space-y-3">
          {filteredFacturas.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
              <DollarSign className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm font-medium">No hay facturas registradas.</p>
              <button
                onClick={openCreateInvoiceModal}
                className="mt-3 text-sm text-emerald-600 font-semibold hover:underline"
              >
                + Crear la primera factura
              </button>
            </div>
          ) : (
            filteredFacturas.map((fac: Factura) => {
              const cli = state.clientes.find((c: Cliente) => c.id === fac.cliente_id);
              const whatsappUrl = generateWhatsappInvoiceUrl(fac, cli, state.settings);

              return (
                <div
                  key={fac.id}
                  className="bg-white shadow-sm border border-slate-200 rounded-2xl p-4 transition-all hover:border-emerald-500 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-800 text-sm">{fac.numero}</span>
                        {fac.ncf && (
                          <span className="text-[11px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            NCF: {fac.ncf}
                          </span>
                        )}
                        <span
                          className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            fac.estado === 'pagada'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-500/30'
                              : fac.estado === 'parcial'
                              ? 'bg-amber-50 text-amber-600 border-amber-500/30'
                              : 'bg-red-50 text-red-600 border-red-500/30'
                          }`}
                        >
                          {fac.estado}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 font-semibold mt-0.5">
                        {cli?.nombre || 'Cliente sin asignar'}
                      </p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {formatDate(fac.fecha)}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-black text-emerald-600 block">
                        {formatCurrency(fac.total)}
                      </span>
                      {fac.saldo_pendiente > 0 ? (
                        <span className="text-xs text-amber-600 font-bold">
                          Debe: {formatCurrency(fac.saldo_pendiente)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-600 font-semibold flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Saldada
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onOpenPdfPreview('factura', fac)}
                        className="flex items-center gap-1 text-slate-600 hover:text-white bg-slate-100/60 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors text-xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-600" /> PDF
                      </button>

                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-emerald-600 hover:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors text-xs font-semibold border border-emerald-500/30"
                      >
                        <Share2 className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {fac.saldo_pendiente > 0 && (
                        <button
                          onClick={() => handleOpenPayment(fac)}
                          className="flex items-center gap-1 text-slate-950 bg-emerald-600 hover:bg-emerald-300 font-bold px-3 py-1 rounded-lg text-xs shadow-sm transition-all"
                        >
                          <DollarSign className="w-3.5 h-3.5" /> Registrar Pago
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar la factura ${fac.numero}?`)) {
                            onDeleteFactura(fac.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100/50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <button
        onClick={subTab === 'cotizaciones' ? openCreateQuoteModal : openCreateInvoiceModal}
        className={`fixed bottom-20 right-4 sm:right-8 z-30 w-14 h-14 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${
          subTab === 'cotizaciones' ? 'bg-blue-600 shadow-blue-900/60' : 'bg-emerald-600 shadow-emerald-600/30'
        }`}
        title={`Crear ${subTab === 'cotizaciones' ? 'Cotización' : 'Factura'}`}
      >
        <Plus className="w-7 h-7" />
      </button>

      {isDocModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-800">
                {subTab === 'cotizaciones' ? 'Nueva Cotización' : 'Nueva Factura'}
              </h3>
              <button
                onClick={() => setIsDocModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDocument} className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">
                    Cliente *
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
                        {c.nombre} {c.documento ? `(${c.documento})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1">
                      Número Correlativo
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.numero}
                      onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1">
                      Fecha
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.fecha}
                      onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {subTab === 'facturas' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">
                    NCF (Número de Comprobante Fiscal — Opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.ncf}
                    onChange={(e) => setFormData({ ...formData, ncf: e.target.value })}
                    placeholder="Ej: B0100000123"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wider">
                    Líneas de Servicios / Productos
                  </h4>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-sm font-semibold text-emerald-600 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar Línea
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white shadow-sm p-3 rounded-xl border border-slate-100 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <select
                          onChange={(e) => selectServiceForLine(idx, e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600 focus:outline-none"
                        >
                          <option value="">-- Tomar del Catálogo --</option>
                          {state.servicios.map((s: Servicio) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre} ({formatCurrency(s.precio_base)} / {s.unidad})
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="text-slate-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <input
                        type="text"
                        required
                        placeholder="Descripción del servicio o artículo..."
                        value={item.descripcion}
                        onChange={(e) => updateLineItem(idx, 'descripcion', e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none"
                      />

                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <label className="block text-[11px] text-slate-400">Cantidad</label>
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={item.cantidad}
                            onChange={(e) => updateLineItem(idx, 'cantidad', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-sm text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400">
                            Precio Unit. (RD$)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.precio_unitario}
                            onChange={(e) =>
                              updateLineItem(idx, 'precio_unitario', e.target.value)
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-sm text-slate-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400">Importe</label>
                          <div className="bg-slate-950 border border-slate-200 rounded-lg px-2.5 py-1 text-sm font-black text-emerald-600">
                            {formatCurrency(item.importe)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.aplica_itbis}
                      onChange={(e) =>
                        setFormData({ ...formData, aplica_itbis: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-emerald-600 bg-white border-slate-200 focus:ring-0"
                    />
                    Aplicar ITBIS ({state.settings.itbis_rate}%)
                  </label>
                </div>

                <div className="border-t border-slate-200 pt-2 space-y-1 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-slate-700">
                      {formatCurrency(subtotalCalculado)}
                    </span>
                  </div>
                  {formData.aplica_itbis && (
                    <div className="flex justify-between text-slate-400">
                      <span>ITBIS ({state.settings.itbis_rate}%):</span>
                      <span className="font-semibold text-slate-700">
                        {formatCurrency(itbisCalculado)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-emerald-600 pt-1 border-t border-slate-200">
                    <span>TOTAL:</span>
                    <span>{formatCurrency(totalCalculado)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  Notas o Condiciones
                </label>
                <textarea
                  rows={2}
                  value={formData.notas}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                  placeholder="Términos de garantía o instrucciones de pago..."
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsDocModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20"
                >
                  Guardar {subTab === 'cotizaciones' ? 'Cotización' : 'Factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPaymentModalOpen && paymentFactura && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">Registrar Pago de Factura</h3>
                <p className="text-sm text-slate-400">{paymentFactura.numero}</p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-3">
              <div className="bg-white p-3 rounded-xl text-sm space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Total Factura:</span>
                  <span className="font-bold text-slate-700">
                    {formatCurrency(paymentFactura.total)}
                  </span>
                </div>
                <div className="flex justify-between text-amber-600 font-bold">
                  <span>Saldo Pendiente Actual:</span>
                  <span>{formatCurrency(paymentFactura.saldo_pendiente)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  Monto a Abonar (RD$) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={paymentFactura.saldo_pendiente}
                  step="any"
                  required
                  value={paymentMonto}
                  onChange={(e) => setPaymentMonto(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  Método de Pago
                </label>
                <select
                  value={paymentMetodo}
                  onChange={(e) => setPaymentMetodo(e.target.value as MetodoPago)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia Bancaria</option>
                  <option value="tarjeta">Tarjeta de Crédito/Débito</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  Referencia / No. de Transacción (Opcional)
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Ej: TR-891234 / Depósito Banreservas"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Confirmar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
