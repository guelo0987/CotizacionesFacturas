import React from 'react';
import type { Cotizacion, Factura, Cliente, BusinessSettings } from '../types';
import { formatCurrency, formatDate, formatDocumento } from '../utils/sanitizer';
import { generatePdfFromElement, printDocumentElement } from '../utils/pdfGenerator';
import { generateWhatsappQuoteUrl, generateWhatsappInvoiceUrl } from '../utils/whatsapp';
import { FileDown, Printer, Share2, X } from 'lucide-react';

interface PdfModalProps {
  type: 'cotizacion' | 'factura';
  doc: Cotizacion | Factura;
  cliente?: Cliente;
  settings: BusinessSettings;
  onClose: () => void;
}

export const PdfModal: React.FC<PdfModalProps> = ({
  type,
  doc,
  cliente,
  settings,
  onClose,
}) => {
  const isInvoice = type === 'factura';
  const invoice = isInvoice ? (doc as Factura) : null;
  const quote = !isInvoice ? (doc as Cotizacion) : null;

  const documentElementId = `pdf-document-${doc.id}`;
  const filename = `${doc.numero}.pdf`;

  const whatsappUrl = isInvoice
    ? generateWhatsappInvoiceUrl(invoice!, cliente, settings)
    : generateWhatsappQuoteUrl(quote!, cliente, settings);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-4 space-y-4 shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 no-print">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Vista Previa de Documento · {doc.numero}
            </h3>
            <p className="text-[11px] text-slate-400">
              Formato listo para impresión y descarga en PDF.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => generatePdfFromElement(documentElementId, filename)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-all shadow-sm"
            >
              <FileDown className="w-4 h-4" /> Descargar PDF
            </button>

            <button
              onClick={() => printDocumentElement(documentElementId)}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3 py-1.5 rounded-xl transition-all"
            >
              <Printer className="w-4 h-4 text-slate-600" /> Imprimir
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 font-semibold text-xs px-3 py-1.5 rounded-xl transition-all"
            >
              <Share2 className="w-4 h-4" /> WhatsApp
            </a>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto pr-1 flex-1 bg-slate-950 p-2 sm:p-4 rounded-xl border border-slate-800">
          <div
            id={documentElementId}
            className="printable-pdf bg-white text-slate-900 p-6 sm:p-8 rounded-lg shadow-xl font-sans max-w-2xl mx-auto space-y-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-5 gap-4">
              <div className="space-y-1.5">
                {settings.logo_url && (
                  <img
                    src={settings.logo_url}
                    alt={settings.business_name}
                    className="max-h-16 rounded object-contain mb-2"
                  />
                )}
                <h1 className="text-xl font-black text-slate-900 tracking-tight leading-tight">
                  {settings.business_name || 'Nombre del Negocio'}
                </h1>
                {settings.documento && (
                  <p className="text-xs text-slate-600 font-mono">
                    RNC: {formatDocumento(settings.documento)}
                  </p>
                )}
                <p className="text-xs text-slate-600">
                  {settings.address && `${settings.address} · `}
                  {settings.phone}
                </p>
                {settings.email && (
                  <p className="text-xs text-slate-600">{settings.email}</p>
                )}
              </div>

              <div className="text-left sm:text-right space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200 min-w-[200px]">
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                  {isInvoice ? 'FACTURA DE VENTA' : 'COTIZACIÓN'}
                </h2>
                <div className="text-sm font-bold text-emerald-700 font-mono">
                  {doc.numero}
                </div>
                {invoice?.ncf && (
                  <div className="text-xs font-mono text-slate-700 font-semibold">
                    NCF: {invoice.ncf}
                  </div>
                )}
                <div className="text-xs text-slate-600">
                  Fecha: <span className="font-semibold">{formatDate(doc.fecha)}</span>
                </div>
                {quote && (
                  <div className="text-xs text-slate-600">
                    Validez: <span className="font-semibold">{quote.validez_dias} días</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-1">
              <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                FACTURADO A / CLIENTE:
              </div>
              <div className="text-sm font-bold text-slate-900">
                {cliente?.nombre || 'Cliente General'}
              </div>
              {cliente?.documento && (
                <div className="text-slate-700 font-mono">
                  RNC/Cédula: {formatDocumento(cliente.documento)}
                </div>
              )}
              {cliente?.telefono && (
                <div className="text-slate-700">Teléfono: {cliente.telefono}</div>
              )}
              {cliente?.direccion && (
                <div className="text-slate-700">Dirección: {cliente.direccion}</div>
              )}
            </div>

            <div>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold uppercase text-[10px]">
                    <th className="p-2.5 rounded-l">Descripción</th>
                    <th className="p-2.5 text-center">Cant.</th>
                    <th className="p-2.5 text-right">Precio Unit.</th>
                    <th className="p-2.5 text-right rounded-r">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {doc.items?.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 font-medium text-slate-800">
                        {item.descripcion}
                      </td>
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
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start pt-4 border-t border-slate-200 gap-4">
              <div className="text-xs text-slate-600 max-w-xs space-y-1">
                <div className="font-bold text-slate-800">Términos y Notas:</div>
                <p className="italic">{doc.notas || 'Gracias por su preferencia.'}</p>
              </div>

              <div className="w-full sm:w-64 space-y-1.5 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex justify-between text-slate-700">
                  <span>Subtotal:</span>
                  <span className="font-semibold">{formatCurrency(doc.subtotal)}</span>
                </div>

                {doc.aplica_itbis && (
                  <div className="flex justify-between text-slate-700">
                    <span>ITBIS ({settings.itbis_rate}%):</span>
                    <span className="font-semibold">{formatCurrency(doc.itbis)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-300">
                  <span>TOTAL:</span>
                  <span className="text-emerald-700">{formatCurrency(doc.total)}</span>
                </div>

                {invoice && (
                  <>
                    <div className="flex justify-between text-slate-700 pt-1 border-t border-slate-200">
                      <span>Monto Pagado:</span>
                      <span className="font-semibold text-emerald-600">
                        {formatCurrency(invoice.monto_pagado)}
                      </span>
                    </div>

                    <div className="flex justify-between font-bold text-amber-800 bg-amber-100 p-1.5 rounded text-xs mt-1">
                      <span>Saldo Pendiente:</span>
                      <span>{formatCurrency(invoice.saldo_pendiente)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="pt-8 text-center border-t border-slate-200 text-[10px] text-slate-400">
              Documento generado electrónicamente por {settings.business_name || 'Sistema de Cotizaciones y Facturas'}.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
