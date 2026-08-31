import type { Pago, Prestamo } from '../types';
import { FRECUENCIAS, frecuenciaSegura, modalidadSegura } from './calculos';

/**
 * Datos derivados que necesitan el comprobante de préstamo y el recibo de
 * abono. Viven aparte de los componentes para no mezclar en un mismo
 * archivo lo que se pinta con lo que se calcula.
 */

/**
 * Los préstamos no llevan numeración correlativa como las facturas, así
 * que el comprobante se identifica con el inicio de su id, que es único y
 * suficiente para localizarlo en el sistema.
 */
export function referenciaPrestamo(prestamo: Prestamo): string {
  return `PRE-${prestamo.id.slice(0, 8).toUpperCase()}`;
}

/** Referencia del recibo: el inicio del id del pago, que es único. */
export function referenciaAbono(pago: Pago): string {
  return `REC-${pago.id.slice(0, 8).toUpperCase()}`;
}

/** Cómo se cobra el interés, en una línea legible. */
export function descripcionInteres(prestamo: Prestamo): string {
  const adjetivo = FRECUENCIAS[frecuenciaSegura(prestamo.frecuencia)].adjetivo;
  switch (modalidadSegura(prestamo.modalidad_interes)) {
    case 'por_periodo':
      return `${prestamo.tasa_interes}% ${adjetivo} sobre el capital, en cada cuota`;
    case 'amortizado':
      return `${prestamo.tasa_interes}% ${adjetivo} sobre el saldo pendiente (cuota fija)`;
    default:
      return `${prestamo.tasa_interes}% único sobre el capital`;
  }
}

/** Total abonado hasta ahora, sumando lo pagado en cada cuota. */
export function totalAbonado(prestamo: Prestamo): number {
  return (prestamo.cuotas ?? []).reduce((suma, c) => suma + (c.monto_pagado || 0), 0);
}

export const METODOS_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia bancaria',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};
