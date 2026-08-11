import React from 'react';
import type { Cotizacion, Factura, Cliente, BusinessSettings } from '../../types';
import { formatCurrency, formatDate, formatDocumento, formatTelefono } from '../../utils/sanitizer';
import { describirNCF } from '../../utils/validacion';
import { FORMATOS, PX_POR_MM, type FormatoImpresion } from '../../utils/formatosImpresion';

interface DocumentoTermicoProps {
  id: string;
  type: 'cotizacion' | 'factura';
  doc: Cotizacion | Factura;
  cliente?: Cliente;
  settings: BusinessSettings;
  formato: FormatoImpresion;
}

/** Separador de guiones, como el de un recibo de caja. */
const Separador: React.FC = () => (
  <div aria-hidden="true" className="border-t border-dashed border-black my-1.5" />
);

/**
 * Cotización o factura en rollo térmico (80 mm y 58 mm).
 *
 * No es la hoja A4 encogida: el recibo es una sola columna, sin fondos ni
 * color —la impresora térmica sólo quema negro, y un fondo oscuro sale
 * como una mancha—, con la tipografía monoespaciada que mantiene los
 * importes alineados. La tabla de cuatro columnas de la hoja no cabe en
 * 48 mm, así que cada línea ocupa dos renglones: descripción arriba,
 * cantidad × precio e importe abajo.
 */
export const DocumentoTermico: React.FC<DocumentoTermicoProps> = ({
  id,
  type,
  doc,
  cliente,
  settings,
  formato,
}) => {
  const isInvoice = type === 'factura';
  const invoice = isInvoice ? (doc as Factura) : null;
  const quote = !isInvoice ? (doc as Cotizacion) : null;
  const items = doc.items ?? [];

  const anchoPx = FORMATOS[formato].anchoPx;
  const estrecho = formato === '58mm';

  /**
   * El QR se mide por su ancho, no encajado en un cuadro: la imagen trae
   * la etiqueta «SCAN ME» debajo, así que meterla en un cuadrado dejaba
   * los módulos del código a ~19 mm, al límite de lo que un lector saca de
   * un papel térmico. A 40 mm (32 mm en el rollo estrecho) se lee sin
   * pelear con él.
   */
  const anchoQrPx = Math.round((estrecho ? 32 : 40) * PX_POR_MM);
  const base = estrecho ? 'text-[9px]' : 'text-[10px]';

  /**
   * En 48 mm de ancho no caben dos importes con «RD$» delante en el mismo
   * renglón, así que en el rollo estrecho se deja sólo la cifra. La
   * moneda queda clara en el TOTAL, que sí lo lleva.
   */
  const monto = (valor: number) =>
    estrecho ? formatCurrency(valor).replace(/^RD\$\s?/, '') : formatCurrency(valor);
  const titulo = estrecho ? 'text-[12px]' : 'text-[14px]';
  const total = estrecho ? 'text-[11px]' : 'text-[13px]';

  const Fila: React.FC<{ etiqueta: string; valor: string; fuerte?: boolean }> = ({
    etiqueta,
    valor,
    fuerte,
  }) => (
    <div className={`flex justify-between gap-2 ${fuerte ? 'font-bold' : ''}`}>
      <span>{etiqueta}</span>
      <span className="tabular-nums whitespace-nowrap">{valor}</span>
    </div>
  );

  return (
    <div
      id={id}
      style={{ width: anchoPx }}
      className={`documento-termico bg-white text-black font-mono ${base} leading-tight mx-auto`}
    >
      {/* Cabecera centrada */}
      <div className="text-center space-y-0.5">
        {settings.logo_url ? (
          <img
            src={settings.logo_url}
            alt=""
            className={`${estrecho ? 'max-h-20' : 'max-h-24'} object-contain mx-auto mb-1`}
          />
        ) : null}
        <div className={`${titulo} font-bold uppercase leading-tight`}>
          {settings.business_name || 'Nombre del negocio'}
        </div>
        {settings.documento ? <div>RNC: {formatDocumento(settings.documento)}</div> : null}
        {settings.address ? <div>{settings.address}</div> : null}
        {settings.phone ? <div>Tel: {formatTelefono(settings.phone)}</div> : null}
        {settings.email ? <div className="break-all">{settings.email}</div> : null}
      </div>

      <Separador />

      {/* Tipo de documento */}
      <div className="text-center space-y-0.5">
        <div className={`${titulo} font-bold uppercase`}>
          {isInvoice ? 'FACTURA DE VENTA' : 'COTIZACIÓN'}
        </div>
        <div className="font-bold">{doc.numero}</div>
        {invoice?.ncf ? (
          <div>
            NCF: {invoice.ncf}
            {describirNCF(invoice.ncf) ? (
              <span className="block">{describirNCF(invoice.ncf)}</span>
            ) : null}
          </div>
        ) : null}
        <div>Fecha: {formatDate(doc.fecha)}</div>
        {quote ? <div>Validez: {quote.validez_dias} días</div> : null}
      </div>

      <Separador />

      {/* Cliente */}
      <div className="space-y-0.5">
        <div className="font-bold uppercase">{isInvoice ? 'Facturado a' : 'Cotizado a'}</div>
        <div>{cliente?.nombre || 'Cliente general'}</div>
        {cliente?.documento ? <div>RNC/Céd: {formatDocumento(cliente.documento)}</div> : null}
        {cliente?.telefono ? <div>Tel: {formatTelefono(cliente.telefono)}</div> : null}
        {cliente?.direccion ? <div>{cliente.direccion}</div> : null}
      </div>

      <Separador />

      {/* Líneas: descripción arriba, cantidad × precio e importe abajo */}
      {items.length === 0 ? (
        <div>Sin líneas de detalle.</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <div key={item.id ?? idx}>
              <div className="font-bold break-words">{item.descripcion}</div>
              <div className="flex justify-between gap-2">
                <span className="whitespace-nowrap">
                  {item.cantidad} x {monto(item.precio_unitario)}
                </span>
                <span className="font-bold tabular-nums whitespace-nowrap">
                  {monto(item.importe)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Separador />

      {/* Totales */}
      <div className="space-y-0.5">
        <Fila etiqueta="Subtotal:" valor={monto(doc.subtotal)} />
        {doc.aplica_itbis ? (
          <Fila etiqueta={`ITBIS (${settings.itbis_rate}%):`} valor={monto(doc.itbis)} />
        ) : null}
        <div className={`${total} font-bold flex justify-between gap-2 pt-1 border-t border-black`}>
          <span>TOTAL:</span>
          <span className="tabular-nums whitespace-nowrap">{formatCurrency(doc.total)}</span>
        </div>

        {invoice ? (
          <>
            <Fila etiqueta="Pagado:" valor={monto(invoice.monto_pagado)} />
            <Fila etiqueta="Saldo:" valor={monto(invoice.saldo_pendiente)} fuerte />
          </>
        ) : null}
      </div>

      {/* Pagos recibidos */}
      {invoice && (invoice.pagos?.length ?? 0) > 0 ? (
        <>
          <Separador />
          <div className="space-y-0.5">
            <div className="font-bold uppercase">Pagos recibidos</div>
            {invoice.pagos!.map((pago) => (
              <div key={pago.id} className="flex justify-between gap-2">
                <span>
                  {formatDate(pago.fecha)} {pago.metodo}
                </span>
                <span className="tabular-nums whitespace-nowrap">{monto(pago.monto)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <Separador />

      {/* Notas */}
      <div className="text-center whitespace-pre-line break-words">
        {doc.notas || 'Gracias por su preferencia.'}
      </div>

      {/* Código QR del negocio */}
      {settings.qr_url ? (
        <div className="text-center mt-2">
          <img
            src={settings.qr_url}
            alt="Código QR del negocio"
            style={{ width: anchoQrPx }}
            className="h-auto mx-auto"
          />
          <div className="font-bold mt-0.5">Síguenos en nuestras redes</div>
        </div>
      ) : null}

      {/* El rollo necesita aire al final: la cuchilla corta unos milímetros
          por debajo del último punto impreso. */}
      <div className="h-6" />
    </div>
  );
};
