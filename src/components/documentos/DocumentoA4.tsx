import React from 'react';
import type { Cotizacion, Factura, Cliente, BusinessSettings } from '../../types';
import { formatCurrency, formatDate, formatDocumento, formatTelefono } from '../../utils/sanitizer';
import { describirNCF } from '../../utils/validacion';

interface DocumentoProps {
  id: string;
  type: 'cotizacion' | 'factura';
  doc: Cotizacion | Factura;
  cliente?: Cliente;
  settings: BusinessSettings;
}

/**
 * Cotización o factura en hoja completa.
 *
 * Ancho fijo y sin puntos de corte responsivos: el PDF y la impresión
 * salen del mismo nodo del DOM, así que la misma factura debe verse igual
 * enviada desde un móvil o desde un ordenador.
 */
export const DocumentoA4: React.FC<DocumentoProps> = ({ id, type, doc, cliente, settings }) => {
  const isInvoice = type === 'factura';
  const invoice = isInvoice ? (doc as Factura) : null;
  const quote = !isInvoice ? (doc as Cotizacion) : null;
  const items = doc.items ?? [];

  return (
    <div
      id={id}
      className="documento-a4 bg-white text-slate-900 p-8 rounded-lg shadow-sm font-sans mx-auto space-y-6"
    >
      {/* Cabecera */}
      <div className="flex justify-between items-start border-b border-slate-200 pb-5 gap-4">
        <div className="space-y-1.5">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="" className="max-h-16 rounded object-contain mb-2" />
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

        <div className="text-right space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200 min-w-[200px]">
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
        <div className="text-sm font-bold text-slate-900">{cliente?.nombre || 'Cliente general'}</div>
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
      <div className="flex justify-between items-start pt-4 border-t border-slate-200 gap-4">
        <div className="text-xs text-slate-600 max-w-xs space-y-1">
          <div className="font-bold text-slate-800">Términos y notas:</div>
          <p className="italic whitespace-pre-line">{doc.notas || 'Gracias por su preferencia.'}</p>
        </div>

        <div className="w-64 shrink-0 space-y-1.5 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
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

      <div className="pt-6 border-t border-slate-200 flex items-end justify-between gap-4">
        <div className="text-[10px] text-slate-400">
          Documento generado electrónicamente por{' '}
          {settings.business_name || 'Sistema de Cotizaciones y Facturas'}.
        </div>

        {settings.qr_url ? (
          <div className="text-center shrink-0">
            <img
              src={settings.qr_url}
              alt="Código QR del negocio"
              className="w-24 h-24 object-contain mx-auto"
            />
            <div className="text-[10px] font-semibold text-slate-600 mt-1">
              Síguenos en nuestras redes
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
