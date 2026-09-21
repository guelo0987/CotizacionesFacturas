import type { Cuota, Pago, Prestamo } from '../types';
import { FRECUENCIAS, frecuenciaSegura, modalidadSegura } from './calculos';
import { redondearDinero } from './validacion';

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

export interface EstadoTrasPago {
  /** Lo abonado a la cuota hasta ese pago, sin contar la mora. */
  abonadoCuota: number;
  restaCuota: number;
  /** Lo abonado al préstamo hasta ese pago, sin contar la mora. */
  abonadoTotal: number;
  saldoPrestamo: number;
  /** Es el pago más reciente del préstamo: lo de hoy también vale para él. */
  esElUltimo: boolean;
}

/** Instante de un pago, para ordenar la historia. */
function instante(pago: Pago): number {
  const t = Date.parse(pago.fecha);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Cómo quedaron la cuota y el préstamo justo después de un pago.
 *
 * Un recibo reimpreso días después tiene que decir lo mismo que el
 * original. Con el estado de hoy, el recibo de la primera cuota de un
 * préstamo ya saldado diría «saldo RD$0.00, préstamo saldado».
 */
export function estadoTrasPago(prestamo: Prestamo, cuota: Cuota, pago: Pago): EstadoTrasPago {
  const resultado = (abonadoCuota: number, abonadoTotal: number, esElUltimo: boolean) => ({
    abonadoCuota: redondearDinero(abonadoCuota),
    restaCuota: redondearDinero(Math.max(0, cuota.monto - abonadoCuota)),
    abonadoTotal: redondearDinero(abonadoTotal),
    saldoPrestamo: redondearDinero(Math.max(0, prestamo.total_a_pagar - abonadoTotal)),
    esElUltimo,
  });

  // Sin el historial de pagos sólo se puede dar el estado de hoy
  if (!prestamo.pagos) {
    return resultado(cuota.monto_pagado || 0, totalAbonado(prestamo), true);
  }

  const pagos = prestamo.pagos.some((p) => p.id === pago.id)
    ? prestamo.pagos
    : [...prestamo.pagos, pago];
  const limite = instante(pago);
  // Los pagos de una misma operación —un saldo— comparten instante: van juntos
  const hasta = pagos.filter((p) => instante(p) <= limite);
  const aLaCuota = (p: Pago) => (p.monto || 0) - (p.monto_mora || 0);

  return resultado(
    hasta.filter((p) => p.cuota_id === cuota.id).reduce((s, p) => s + aLaCuota(p), 0),
    hasta.reduce((s, p) => s + aLaCuota(p), 0),
    hasta.length === pagos.length
  );
}

export const METODOS_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia bancaria',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};
