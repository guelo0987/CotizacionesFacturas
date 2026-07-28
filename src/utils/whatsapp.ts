import type { Cotizacion, Factura, Prestamo, Cuota, Cliente, BusinessSettings } from '../types';
import { formatCurrency, formatDate } from './sanitizer';
import { telefonoParaWhatsapp } from './validacion';

export function construirUrl(mensaje: string, telefono?: string | null): string {
  const encoded = encodeURIComponent(mensaje);
  const numero = telefono ? telefonoParaWhatsapp(telefono) : '';
  return numero ? `https://wa.me/${numero}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/**
 * Resumen del documento para acompañar al PDF.
 *
 * Se separa del enlace porque compartir el archivo con la hoja nativa del
 * sistema —donde el usuario elige el contacto dentro de WhatsApp— necesita
 * el texto suelto, no una URL de `wa.me`.
 */
export function mensajeCotizacion(
  cotizacion: Cotizacion,
  cliente?: Cliente,
  settings?: BusinessSettings
): string {
  const businessName = settings?.business_name || 'Nuestro negocio';

  let msg = `*Estimado(a) ${cliente?.nombre || 'Cliente'},*\n\n`;
  msg += `Le enviamos la cotización *${cotizacion.numero}* de *${businessName}*:\n\n`;
  msg += `📅 *Fecha:* ${formatDate(cotizacion.fecha)}\n`;
  msg += `⏳ *Validez:* ${cotizacion.validez_dias} días\n`;
  msg += `💰 *Subtotal:* ${formatCurrency(cotizacion.subtotal)}\n`;
  if (cotizacion.aplica_itbis) {
    msg += `📊 *ITBIS (${settings?.itbis_rate ?? 18}%):* ${formatCurrency(cotizacion.itbis)}\n`;
  }
  msg += `💵 *TOTAL:* ${formatCurrency(cotizacion.total)}\n\n`;

  if (cotizacion.items && cotizacion.items.length > 0) {
    msg += `📋 *Detalle de servicios:*\n`;
    cotizacion.items.forEach((item, idx) => {
      msg += `${idx + 1}. ${item.descripcion} (${item.cantidad} x ${formatCurrency(item.precio_unitario)}) = ${formatCurrency(item.importe)}\n`;
    });
    msg += `\n`;
  }

  msg += `Quedamos a su disposición para cualquier duda o confirmación.\n¡Gracias por preferirnos!`;

  return msg;
}

export function mensajeFactura(
  factura: Factura,
  cliente?: Cliente,
  settings?: BusinessSettings
): string {
  const businessName = settings?.business_name || 'Nuestro negocio';

  let msg = `*Estimado(a) ${cliente?.nombre || 'Cliente'},*\n\n`;
  msg += `Adjuntamos el detalle de su factura *${factura.numero}* de *${businessName}*:\n\n`;
  msg += `📅 *Fecha:* ${formatDate(factura.fecha)}\n`;
  if (factura.ncf) {
    msg += `📑 *NCF:* ${factura.ncf}\n`;
  }
  msg += `💵 *Total factura:* ${formatCurrency(factura.total)}\n`;
  msg += `✅ *Monto pagado:* ${formatCurrency(factura.monto_pagado)}\n`;
  msg += `📌 *Saldo pendiente:* ${formatCurrency(factura.saldo_pendiente)}\n\n`;

  msg +=
    factura.saldo_pendiente > 0
      ? `*Estado:* 🟡 PENDIENTE DE PAGO (${formatCurrency(factura.saldo_pendiente)})\n\n`
      : `*Estado:* 🟢 FACTURA PAGADA EN SU TOTALIDAD\n\n`;

  msg += `¡Gracias por su confianza y puntualidad!`;

  return msg;
}

/** Mensaje que acompaña al PDF de una cotización o factura. */
export function mensajeDocumento(
  tipo: 'cotizacion' | 'factura',
  doc: Cotizacion | Factura,
  cliente?: Cliente,
  settings?: BusinessSettings
): string {
  return tipo === 'factura'
    ? mensajeFactura(doc as Factura, cliente, settings)
    : mensajeCotizacion(doc as Cotizacion, cliente, settings);
}

export function generateWhatsappLoanCuotaUrl(
  prestamo: Prestamo,
  cuota: Cuota,
  cliente?: Cliente,
  settings?: BusinessSettings
): string {
  const businessName = settings?.business_name || 'Nuestro negocio';
  const restante = Math.max(0, cuota.monto - (cuota.monto_pagado || 0));

  let msg = `*Recordatorio de cuota — ${businessName}*\n\n`;
  msg += `Hola *${cliente?.nombre || 'Cliente'}*,\n`;
  msg += `Le recordamos el detalle de la cuota #${cuota.numero} de ${prestamo.num_cuotas} de su préstamo:\n\n`;
  msg += `🗓️ *Fecha de vencimiento:* ${formatDate(cuota.fecha_vencimiento)}\n`;
  msg += `💵 *Monto de la cuota:* ${formatCurrency(cuota.monto)}\n`;

  if (cuota.monto_pagado > 0 && cuota.estado !== 'pagada') {
    msg += `✅ *Abonado:* ${formatCurrency(cuota.monto_pagado)}\n`;
    msg += `📌 *Resta por pagar:* ${formatCurrency(restante)}\n`;
  }

  const etiquetaEstado =
    cuota.estado === 'pagada'
      ? '🟢 PAGADA'
      : cuota.estado === 'atrasada'
      ? '🔴 ATRASADA'
      : cuota.estado === 'parcial'
      ? '🟠 ABONO PARCIAL'
      : '🟡 PENDIENTE';

  msg += `📊 *Estado:* ${etiquetaEstado}\n\n`;
  msg += `Por favor coordinar su pago a la brevedad. ¡Gracias!`;

  return construirUrl(msg, cliente?.telefono);
}
