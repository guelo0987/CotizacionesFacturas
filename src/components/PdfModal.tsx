import React, { useState } from 'react';
import type { Cotizacion, Factura, Cliente, BusinessSettings } from '../types';
import { formatCurrency, formatDate, formatDocumento, formatTelefono } from '../utils/sanitizer';
import { describirNCF } from '../utils/validacion';
import { generatePdfFromElement, printDocumentElement } from '../utils/pdfGenerator';
import { generateWhatsappQuoteUrl, generateWhatsappInvoiceUrl } from '../utils/whatsapp';
import { useFeedback, mensajeDeError } from './feedback/contexto';
import { FileDown, Printer, Share2, X } from 'lucide-react';

interface PdfModalProps {
  type: 'cotizacion' | 'factura';
  doc: Cotizacion | Factura;
  cliente?: Cliente;
  settings: BusinessSettings;
  onClose: () => void;
}

export const PdfModal: React.FC<PdfModalProps> = ({ type, doc, cliente, settings, onClose }) => {
  const { error: avisarError } = useFeedback();
  const [generando, setGenerando] = useState(false);

  const isInvoice = type === 'factura';
  const invoice = isInvoice ? (doc as Factura) : null;
  const quote = !isInvoice ? (doc as Cotizacion) : null;

  const documentElementId = `pdf-document-${doc.id}`;
  const filename = `${doc.numero}.pdf`;
  const items = doc.items ?? [];

  const whatsappUrl = isInvoice
    ? generateWhatsappInvoiceUrl(invoice!, cliente, settings)
    : generateWhatsappQuoteUrl(quote!, cliente, settings);

  const descargar = async () => {
    setGenerando(true);
    try {
      await generatePdfFromElement(documentElementId, filename);
    } catch (e) {
      avisarError(mensajeDeError(e));
    } finally {
      setGenerando(false);
    }
  };

  const imprimir = () => {
    try {
      printDocumentElement(documentElementId);
    } catch (e) {
      avisarError(mensajeDeError(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-start sm:items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-4 space-y-4 shadow-2xl max-h-[95vh] flex flex-col my-4">
        <div className="flex items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3 no-print flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">
              Vista previa · {doc.numero}
            </h3>
            <p className="text-[11px] text-slate-500">Listo para imprimir o descargar en PDF.</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={descargar}
              disabled={generando}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-all shadow-sm"
            >
              <FileDown className="w-4 h-4" /> {generando ? 'Generando…' : 'Descargar PDF'}
            </button>

            <button
              onClick={imprimir}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold text-xs px-3 py-1.5 rounded-xl transition-all"
            >
              <Printer className="w-4 h-4 text-slate-500" /> Imprimir
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-semibold text-xs px-3 py-1.5 rounded-xl transition-all"
            >
              <Share2 className="w-4 h-4" /> WhatsApp
            </a>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700"
              aria-label="Cerrar vista previa"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto pr-1 flex-1 bg-slate-100 p-2 sm:p-4 rounded-xl border border-slate-200">
          <div
            id={documentElementId}
            className="printable-pdf bg-white text-slate-900 p-6 sm:p-8 rounded-lg shadow-sm font-sans max-w-2xl mx-auto space-y-6"
          >
            {/* Cabecera */}
            <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-5 gap-4">
              <div className="space-y-1.5">
                {settings.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt=""
                    className="max-h-16 rounded object-contain mb-2"
                  />
                ) : null}
                <h1 className="text-xl font-black text-slate-900 tracking-tight leading-tight">
                  {settings.business_name || 'Nombre del negocio'}
                </h1>
                {settings.documento ? (
                  <p className="text-xs text-slate-600 font-mono">
                    RNC: {formatDocumento(settings.documento)}
                  </p>
                ) : null}
                <p className="text-xs text-slate-600">
                  {settings.address ? `${settings.address} · ` : ''}
                  {formatTelefono(settings.phone)}
                </p>
                {settings.email ? <p className="text-xs text-slate-600">{settings.email}</p> : null}
              </div>

              <div className="text-left sm:text-right space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200 min-w-[200px]">
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                  {isInvoice ? 'FACTURA DE VENTA' : 'COTIZACIÓN'}
                </h2>
                <div className="text-sm font-bold text-emerald-700 font-mono">{doc.numero}</div>
                {invoice?.ncf ? (
                  <div className="text-xs font-mono text-slate-700 font-semibold">
                    NCF: {invoice.ncf}
                    {describirNCF(invoice.ncf) ? (
                      <span className="block font-sans font-normal text-slate-500">
                        {describirNCF(invoice.ncf)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="text-xs text-slate-600">
                  Fecha: <span className="font-semibold">{formatDate(doc.fecha)}</span>
                </div>
                {quote ? (
                  <div className="text-xs text-slate-600">
                    Validez: <span className="font-semibold">{quote.validez_dias} días</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Cliente */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-1">
              <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                {isInvoice ? 'FACTURADO A' : 'COTIZADO A'}
              </div>
              <div className="text-sm font-bold text-slate-900">
                {cliente?.nombre || 'Cliente general'}
              </div>
              {cliente?.documento ? (
                <div className="text-slate-700 font-mono">
                  RNC/Cédula: {formatDocumento(cliente.documento)}
                </div>
              ) : null}
              {cliente?.telefono ? (
                <div className="text-slate-700">Teléfono: {formatTelefono(cliente.telefono)}</div>
              ) : null}
              {cliente?.direccion ? (
                <div className="text-slate-700">Dirección: {cliente.direccion}</div>
              ) : null}
            </div>

            {/* Líneas */}
            <div>
              {items.length === 0 ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                  Este documento no tiene líneas de detalle.
                </p>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold uppercase text-[10px]">
                      <th className="p-2.5 rounded-l">Descripción</th>
                      <th className="p-2.5 text-center">Cant.</th>
                      <th className="p-2.5 text-right">Precio unit.</th>
                      <th className="p-2.5 text-right rounded-r">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((item, idx) => (
                      <tr key={item.id ?? idx}>
                        <td className="p-2.5 font-medium text-slate-800">{item.descripcion}</td>
                        <td className="p-2.5 text-center text-slate-700">{item.cantidad}</td>
                        <td className="p-2.5 text-right text-slate-700">
                          {formatCurrency(item.precio_unitario)}
                        </td>
                        <td className="p-2.5 text-right font-bold text-slate-900">
                          {formatCurrency(item.importe)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Totales */}
            <div className="flex flex-col sm:flex-row justify-between items-start pt-4 border-t border-slate-200 gap-4">
              <div className="text-xs text-slate-600 max-w-xs space-y-1">
                <div className="font-bold text-slate-800">Términos y notas:</div>
                <p className="italic whitespace-pre-line">
                  {doc.notas || 'Gracias por su preferencia.'}
                </p>
              </div>

              <div className="w-full sm:w-64 space-y-1.5 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex justify-between text-slate-700">
                  <span>Subtotal:</span>
                  <span className="font-semibold">{formatCurrency(doc.subtotal)}</span>
                </div>

                {doc.aplica_itbis ? (
                  <div className="flex justify-between text-slate-700">
                    <span>ITBIS ({settings.itbis_rate}%):</span>
                    <span className="font-semibold">{formatCurrency(doc.itbis)}</span>
                  </div>
                ) : null}

                <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-300">
                  <span>TOTAL:</span>
                  <span className="text-emerald-700">{formatCurrency(doc.total)}</span>
                </div>

                {invoice ? (
                  <>
                    <div className="flex justify-between text-slate-700 pt-1 border-t border-slate-200">
                      <span>Monto pagado:</span>
                      <span className="font-semibold text-emerald-700">
                        {formatCurrency(invoice.monto_pagado)}
                      </span>
                    </div>

                    <div className="flex justify-between font-bold text-amber-900 bg-amber-100 p-1.5 rounded text-xs mt-1">
                      <span>Saldo pendiente:</span>
                      <span>{formatCurrency(invoice.saldo_pendiente)}</span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {/* Historial de pagos */}
            {invoice && (invoice.pagos?.length ?? 0) > 0 ? (
              <div className="pt-2 border-t border-slate-200">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Pagos recibidos
                </div>
                <div className="space-y-1">
                  {invoice.pagos!.map((pago) => (
                    <div key={pago.id} className="flex justify-between text-xs text-slate-700">
                      <span>
                        {formatDate(pago.fecha)} · {pago.metodo}
                        {pago.referencia ? ` · ${pago.referencia}` : ''}
                      </span>
                      <span className="font-semibold">{formatCurrency(pago.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="pt-8 text-center border-t border-slate-200 text-[10px] text-slate-400">
              Documento generado electrónicamente por{' '}
              {settings.business_name || 'Sistema de Cotizaciones y Facturas'}.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
