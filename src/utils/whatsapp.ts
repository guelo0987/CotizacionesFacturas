import type { Cotizacion, Factura, Prestamo, Cuota, Cliente, BusinessSettings } from '../types';
import { formatCurrency, formatDate } from './sanitizer';

function cleanPhoneForWhatsapp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) {
    return digits;
  }
  if (digits.length === 10) {
    return `1${digits}`;
  }
  return digits;
}

export function generateWhatsappQuoteUrl(
  cotizacion: Cotizacion,
  cliente?: Cliente,
  settings?: BusinessSettings
): string {
  const phone = cliente?.telefono ? cleanPhoneForWhatsapp(cliente.telefono) : '';
  const businessName = settings?.business_name || 'Nuestro negocio';
  
  let msg = `*Estimado(a) ${cliente?.nombre || 'Cliente'},*\n\n`;
  msg += `Le enviamos la cotización *${cotizacion.numero}* de *${businessName}*:\n\n`;
  msg += `📅 *Fecha:* ${formatDate(cotizacion.fecha)}\n`;
  msg += `⏳ *Validez:* ${cotizacion.validez_dias} días\n`;
  msg += `💰 *Subtotal:* ${formatCurrency(cotizacion.subtotal)}\n`;
  if (cotizacion.aplica_itbis) {
    msg += `📊 *ITBIS (${settings?.itbis_rate || 18}%):* ${formatCurrency(cotizacion.itbis)}\n`;
  }
  msg += `💵 *TOTAL:* ${formatCurrency(cotizacion.total)}\n\n`;

  if (cotizacion.items && cotizacion.items.length > 0) {
    msg += `📋 *Detalle de Servicios:*\n`;
    cotizacion.items.forEach((item, idx) => {
      msg += `${idx + 1}. ${item.descripcion} (${item.cantidad} x ${formatCurrency(item.precio_unitario)}) = ${formatCurrency(item.importe)}\n`;
    });
    msg += `\n`;
  }

  msg += `Quedamos a su disposición para cualquier duda o confirmación.\n¡Gracias por preferirnos!`;

  const encoded = encodeURIComponent(msg);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function generateWhatsappInvoiceUrl(
  factura: Factura,
  cliente?: Cliente,
  settings?: BusinessSettings
): string {
  const phone = cliente?.telefono ? cleanPhoneForWhatsapp(cliente.telefono) : '';
  const businessName = settings?.business_name || 'Nuestro negocio';
  
  let msg = `*Estimado(a) ${cliente?.nombre || 'Cliente'},*\n\n`;
  msg += `Adjuntamos el detalle de su factura *${factura.numero}* de *${businessName}*:\n\n`;
  msg += `📅 *Fecha:* ${formatDate(factura.fecha)}\n`;
  if (factura.ncf) {
    msg += `📑 *NCF:* ${factura.ncf}\n`;
  }
  msg += `💵 *Total Factura:* ${formatCurrency(factura.total)}\n`;
  msg += `✅ *Monto Pagado:* ${formatCurrency(factura.monto_pagado)}\n`;
  msg += `📌 *Saldo Pendiente:* ${formatCurrency(factura.saldo_pendiente)}\n\n`;

  if (factura.saldo_pendiente > 0) {
    msg += `*Estado:* 🟡 PENDIENTE DE PAGO (${formatCurrency(factura.saldo_pendiente)})\n\n`;
  } else {
    msg += `*Estado:* 🟢 FACTURA PAGADA EN SU TOTALIDAD\n\n`;
  }

  msg += `¡Gracias por su confianza y puntualidad!`;

  const encoded = encodeURIComponent(msg);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function generateWhatsappLoanCuotaUrl(
  _prestamo: Prestamo,
  cuota: Cuota,
  cliente?: Cliente,
  settings?: BusinessSettings
): string {
  const phone = cliente?.telefono ? cleanPhoneForWhatsapp(cliente.telefono) : '';
  const businessName = settings?.business_name || 'Nuestro negocio';

  let msg = `*Recordatorio de Cuota - ${businessName}*\n\n`;
  msg += `Hola *${cliente?.nombre || 'Cliente'}*,\n`;
  msg += `Le recordamos el detalle de la cuota #${cuota.numero} de su préstamo:\n\n`;
  msg += `🗓️ *Fecha Vencimiento:* ${formatDate(cuota.fecha_vencimiento)}\n`;
  msg += `💵 *Monto Cuota:* ${formatCurrency(cuota.monto)}\n`;
  msg += `📌 *Estado:* ${cuota.estado === 'pagada' ? '🟢 PAGADA' : cuota.estado === 'atrasada' ? '🔴 ATRASADA' : '🟡 PENDIENTE'}\n\n`;
  msg += `Por favor coordinar su pago a la brevedad. ¡Gracias!`;

  const encoded = encodeURIComponent(msg);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}
