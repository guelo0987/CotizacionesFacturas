import type { Cuota, Pago, Prestamo } from '../types';
import { FRECUENCIAS, frecuenciaSegura, modalidadSegura, moraPendiente } from './calculos';
import { redondearDinero } from './validacion';
import { aCuotaDePago } from './creditos';

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

/** Préstamo a rédito: sin plazo, se cobra el rédito hasta que pague el capital. */
export function esRedito(prestamo: Pick<Prestamo, 'modalidad_interes'> | null | undefined): boolean {
  return prestamo?.modalidad_interes === 'redito';
}

/** «Cuota #3», «Rédito #3» o «Capital». */
export function etiquetaCuota(
  cuota: Pick<Cuota, 'numero' | 'es_capital'>,
  prestamo?: Pick<Prestamo, 'modalidad_interes'> | null
): string {
  if (cuota.es_capital) return 'Capital';
  return esRedito(prestamo) ? `Rédito #${cuota.numero}` : `Cuota #${cuota.numero}`;
}

/** «Cuota #3 de 8», «Rédito #3» o «Capital»: con el total sólo si hay plazo. */
export function etiquetaCuotaDe(
  cuota: Pick<Cuota, 'numero' | 'es_capital'>,
  prestamo: Pick<Prestamo, 'modalidad_interes' | 'num_cuotas'>
): string {
  const etiqueta = etiquetaCuota(cuota, prestamo);
  return esRedito(prestamo) ? etiqueta : `${etiqueta} de ${prestamo.num_cuotas}`;
}

/** «8 cuotas» o «Plazo indefinido». */
export function plazoPrestamo(prestamo: Pick<Prestamo, 'modalidad_interes' | 'num_cuotas'>): string {
  if (esRedito(prestamo)) return 'Plazo indefinido';
  return `${prestamo.num_cuotas} ${prestamo.num_cuotas === 1 ? 'cuota' : 'cuotas'}`;
}

/** La cuota de capital de un préstamo a rédito. */
export function cuotaCapital(prestamo: Prestamo): Cuota | undefined {
  return (prestamo.cuotas ?? []).find((c) => c.es_capital);
}

/** Capital que todavía se debe en un préstamo a rédito. */
export function capitalPendiente(prestamo: Prestamo): number {
  const capital = cuotaCapital(prestamo);
  return capital ? redondearDinero(Math.max(0, capital.monto - (capital.monto_pagado || 0))) : 0;
}

/** Rédito de un periodo con el capital que se debe hoy. */
export function reditoActual(prestamo: Prestamo): number {
  return redondearDinero((capitalPendiente(prestamo) * (Number(prestamo.tasa_interes) || 0)) / 100);
}

export interface RepartoRedito {
  /** Lo que la cuota ya tenía abonado y cuenta para el rédito. */
  yaAbonado: number;
  /** Rédito que falta cobrar. */
  faltaRedito: number;
  mora: number;
  /** Capital de la cuota que queda pagado (lo de antes que pasó del rédito + el abono). */
  capitalPagado: number;
  /** Capital de la cuota que se corre al periodo siguiente. */
  capitalQueSeCorre: number;
  /** Lo que se cobra ahora. */
  cobro: number;
  error: string | null;
}

/**
 * «Rédito + capital» en un préstamo con cuotas. Reproduce `pagar_solo_redito`
 * del servidor: lo ya abonado cuenta primero para el rédito, se cobra lo que
 * falte del rédito, la mora y el abono a capital, y el capital que no se pagó
 * se corre con la cuota al periodo siguiente.
 */
export function repartoRedito(cuota: Cuota, abonoCapital: number): RepartoRedito {
  const abono = redondearDinero(Math.max(0, Number(abonoCapital) || 0));
  const pagado = redondearDinero(cuota.monto_pagado || 0);
  const interes = redondearDinero(cuota.interes || 0);
  const capital = redondearDinero(cuota.capital || 0);
  const previoAlRedito = Math.min(pagado, interes);
  const previoACapital = redondearDinero(pagado - previoAlRedito);
  const faltaRedito = redondearDinero(interes - previoAlRedito);
  const mora = moraPendiente(cuota);
  const capitalPagado = redondearDinero(previoACapital + abono);

  return {
    yaAbonado: pagado,
    faltaRedito,
    mora,
    capitalPagado,
    capitalQueSeCorre: redondearDinero(Math.max(0, capital - capitalPagado)),
    cobro: redondearDinero(faltaRedito + mora + abono),
    error:
      capitalPagado >= capital
        ? 'Con ese abono se paga la cuota completa: cóbrala con «Cuota completa».'
        : null,
  };
}

/** Cómo se cobra el interés, en una línea legible. */
export function descripcionInteres(prestamo: Prestamo): string {
  const adjetivo = FRECUENCIAS[frecuenciaSegura(prestamo.frecuencia)].adjetivo;
  switch (modalidadSegura(prestamo.modalidad_interes)) {
    case 'por_periodo':
      return `${prestamo.tasa_interes}% ${adjetivo} sobre el capital, en cada cuota`;
    case 'amortizado':
      return `${prestamo.tasa_interes}% ${adjetivo} sobre el saldo pendiente (cuota fija)`;
    case 'redito':
      return `${prestamo.tasa_interes}% ${adjetivo} sobre el capital que se deba (a rédito, sin plazo)`;
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
  /**
   * Préstamo a rédito: capital que quedó debiendo. Su «saldo» crece con
   * cada periodo nuevo, así que lo que sirve en el recibo es el capital.
   */
  capitalPendiente: number | null;
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
  const capital = esRedito(prestamo) ? cuotaCapital(prestamo) : undefined;
  const resultado = (
    abonadoCuota: number,
    abonadoTotal: number,
    esElUltimo: boolean,
    abonadoCapital: number | null
  ) => ({
    abonadoCuota: redondearDinero(abonadoCuota),
    restaCuota: redondearDinero(Math.max(0, cuota.monto - abonadoCuota)),
    abonadoTotal: redondearDinero(abonadoTotal),
    saldoPrestamo: redondearDinero(Math.max(0, prestamo.total_a_pagar - abonadoTotal)),
    esElUltimo,
    capitalPendiente:
      capital && abonadoCapital !== null
        ? redondearDinero(Math.max(0, capital.monto - abonadoCapital))
        : null,
  });

  // Sin el historial de pagos sólo se puede dar el estado de hoy
  if (!prestamo.pagos) {
    return resultado(cuota.monto_pagado || 0, totalAbonado(prestamo), true, capital?.monto_pagado ?? null);
  }

  const pagos = prestamo.pagos.some((p) => p.id === pago.id)
    ? prestamo.pagos
    : [...prestamo.pagos, pago];
  const limite = instante(pago);
  // Los pagos de una misma operación —un saldo— comparten instante: van juntos
  const hasta = pagos.filter((p) => instante(p) <= limite);
  // El saldo a favor usado cuenta como abono; el excedente, no
  const aLaCuota = (p: Pago) => aCuotaDePago(p);

  return resultado(
    hasta.filter((p) => p.cuota_id === cuota.id).reduce((s, p) => s + aLaCuota(p), 0),
    hasta.reduce((s, p) => s + aLaCuota(p), 0),
    hasta.length === pagos.length,
    capital ? hasta.filter((p) => p.cuota_id === capital.id).reduce((s, p) => s + aLaCuota(p), 0) : null
  );
}

export const METODOS_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia bancaria',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
  saldo_a_favor: 'Saldo a favor',
};
