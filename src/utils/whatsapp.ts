import type { Cotizacion, Factura, Prestamo, Cuota, Pago, Cliente, BusinessSettings } from '../types';
import { formatCurrency, formatDate } from './sanitizer';
import { telefonoParaWhatsapp } from './validacion';
import { estadoTrasPago } from './documentosPrestamo';

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

/** Resumen del préstamo para acompañar a su comprobante en PDF. */
export function mensajePrestamo(
  prestamo: Prestamo,
  cliente?: Cliente,
  settings?: BusinessSettings
): string {
  const businessName = settings?.business_name || 'Nuestro negocio';

  let msg = `*Comprobante de préstamo — ${businessName}*\n\n`;
  msg += `Hola *${cliente?.nombre || 'Cliente'}*,\n`;
  msg += `Le enviamos el detalle de su préstamo:\n\n`;
  msg += `💵 *Capital prestado:* ${formatCurrency(prestamo.monto_prestado)}\n`;
  msg += `📊 *Interés total:* ${formatCurrency(prestamo.interes_total)}\n`;
  msg += `💰 *Total a pagar:* ${formatCurrency(prestamo.total_a_pagar)}\n`;
  msg += `🗓️ *Cuotas:* ${prestamo.num_cuotas} (${prestamo.frecuencia})\n`;
  msg += `📅 *Inicio:* ${formatDate(prestamo.fecha_inicio)}\n\n`;
  msg += `Adjuntamos el comprobante con el calendario completo de cuotas.\n¡Gracias por su confianza!`;

  return msg;
}

/** Resumen del abono para acompañar al recibo en PDF. */
export function mensajeAbono(
  prestamo: Prestamo,
  cuota: Cuota,
  pago: Pago,
  cliente?: Cliente,
  settings?: BusinessSettings
): string {
  const businessName = settings?.business_name || 'Nuestro negocio';
  // El saldo que dejó este abono, igual que en el recibo que acompaña
  const saldo = estadoTrasPago(prestamo, cuota, pago).saldoPrestamo;

  let msg = `*Recibo de abono — ${businessName}*\n\n`;
  msg += `Hola *${cliente?.nombre || 'Cliente'}*,\n`;
  msg += `Confirmamos su pago:\n\n`;
  msg += `✅ *Monto recibido:* ${formatCurrency(pago.monto)}\n`;
  msg += `📅 *Fecha:* ${formatDate(pago.fecha)}\n`;
  msg += `🧾 *Cuota:* #${cuota.numero} de ${prestamo.num_cuotas}\n`;
  msg += saldo > 0
    ? `📌 *Saldo del préstamo:* ${formatCurrency(saldo)}\n\n`
    : `🟢 *PRÉSTAMO SALDADO POR COMPLETO*\n\n`;
  msg += `Adjuntamos el recibo. ¡Gracias por su puntualidad!`;

  return msg;
}

/** Resumen del saldo para acompañar a su recibo en PDF. */
export function mensajeSaldo(
  prestamo: Prestamo,
  pagos: Pago[],
  cliente?: Cliente,
  settings?: BusinessSettings
): string {
  const businessName = settings?.business_name || 'Nuestro negocio';
  const total = pagos.reduce((a, p) => a + p.monto, 0);
  const mora = pagos.reduce((a, p) => a + (p.monto_mora || 0), 0);

  let msg = `*Préstamo saldado — ${businessName}*\n\n`;
  msg += `Hola *${cliente?.nombre || 'Cliente'}*,\n`;
  msg += `Confirmamos que su préstamo quedó saldado por completo.\n\n`;
  msg += `✅ *Monto recibido:* ${formatCurrency(total)}\n`;
  msg += `🧾 *Cuotas liquidadas:* ${pagos.length} de ${prestamo.num_cuotas}\n`;
  if (mora > 0) msg += `⚠️ *Incluye mora:* ${formatCurrency(mora)}\n`;
  msg += `🟢 *Saldo pendiente:* ${formatCurrency(0)}\n\n`;
  msg += `Adjuntamos el recibo. ¡Gracias por su confianza!`;

  return msg;
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
