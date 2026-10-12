import type { MovimientoCredito, Pago, TipoMovimientoCredito } from '../types';
import { formatCurrency } from './sanitizer';
import { redondearDinero } from './validacion';

/**
 * Saldo a favor de los clientes.
 *
 * El servidor es la autoridad: guarda el libro de movimientos y rechaza
 * cualquier cobro que deje un saldo negativo. Aquí sólo se calcula lo que
 * la pantalla necesita mostrar antes de enviar, con las mismas reglas.
 */

/** Saldo a favor de un cliente: la suma de su libro. */
export function saldoCliente(movimientos: MovimientoCredito[], clienteId: string): number {
  return redondearDinero(
    movimientos
      .filter((m) => m.cliente_id === clienteId)
      .reduce((suma, m) => suma + (Number(m.monto) || 0), 0)
  );
}

/** Saldo de cada cliente que tenga alguno distinto de cero, para las listas. */
export function saldosPorCliente(movimientos: MovimientoCredito[]): Map<string, number> {
  const saldos = new Map<string, number>();
  for (const m of movimientos) {
    saldos.set(m.cliente_id, (saldos.get(m.cliente_id) ?? 0) + (Number(m.monto) || 0));
  }
  for (const [cliente, saldo] of saldos) {
    const redondo = redondearDinero(saldo);
    if (redondo === 0) saldos.delete(cliente);
    else saldos.set(cliente, redondo);
  }
  return saldos;
}

function instante(fecha: string): number {
  const t = Date.parse(fecha);
  return Number.isFinite(t) ? t : 0;
}

/** Orden del libro: por fecha y, en la misma operación, por id. */
function compararMovimientos(a: MovimientoCredito, b: MovimientoCredito): number {
  return instante(a.fecha) - instante(b.fecha) || a.id.localeCompare(b.id);
}

export type RenglonLibro = MovimientoCredito & { saldo: number };

/**
 * El libro de un cliente con el saldo que quedó tras cada movimiento, en
 * orden cronológico.
 */
export function libroCliente(movimientos: MovimientoCredito[], clienteId: string): RenglonLibro[] {
  let saldo = 0;
  return movimientos
    .filter((m) => m.cliente_id === clienteId)
    .sort(compararMovimientos)
    .map((m) => {
      saldo = redondearDinero(saldo + (Number(m.monto) || 0));
      return { ...m, saldo };
    });
}

/**
 * Saldo que tenía el cliente justo después de un instante: el de un recibo
 * reimpreso días después tiene que ser el de aquel momento, no el de hoy.
 */
export function saldoClienteHasta(
  movimientos: MovimientoCredito[],
  clienteId: string,
  fecha: string
): number {
  const limite = instante(fecha);
  return redondearDinero(
    movimientos
      .filter((m) => m.cliente_id === clienteId && instante(m.fecha) <= limite)
      .reduce((suma, m) => suma + (Number(m.monto) || 0), 0)
  );
}

// ---------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------

/** Lo que un pago aplicó a la deuda: el dinero más el saldo usado, menos lo que sobró. */
export function aplicadoDePago(pago: Pick<Pago, 'monto' | 'credito_usado' | 'excedente'>): number {
  return redondearDinero(
    (Number(pago.monto) || 0) + (Number(pago.credito_usado) || 0) - (Number(pago.excedente) || 0)
  );
}

/** Lo que un pago aplicó a la cuota, sin contar la mora. */
export function aCuotaDePago(
  pago: Pick<Pago, 'monto' | 'credito_usado' | 'excedente' | 'monto_mora'>
): number {
  return redondearDinero(aplicadoDePago(pago) - (Number(pago.monto_mora) || 0));
}

/**
 * Aclaración de un pago que tocó el saldo a favor, para las listas de pagos
 * de los documentos; `null` si fue un pago normal.
 */
export function notaCreditoPago(pago: Pick<Pago, 'monto' | 'credito_usado' | 'excedente'>): string | null {
  const credito = Number(pago.credito_usado) || 0;
  const excedente = Number(pago.excedente) || 0;
  if (credito > 0 && (Number(pago.monto) || 0) <= 0) return 'Pagado con saldo a favor';
  if (credito > 0) return `Incluye ${formatCurrency(credito)} de saldo a favor`;
  if (excedente > 0) {
    return `Recibido ${formatCurrency(pago.monto)}: ${formatCurrency(excedente)} quedaron a favor`;
  }
  return null;
}

// ---------------------------------------------------------------------
// Reparto de un cobro
// ---------------------------------------------------------------------

export interface DatosCobro {
  /** Efectivo que entrega el cliente. */
  efectivo: number;
  /** Saldo a favor que el cobrador decidió usar. */
  credito: number;
  /** Lo más que se puede aplicar a la deuda en este cobro. */
  deuda: number;
  /** Saldo a favor que tiene el cliente. */
  saldoDisponible: number;
}

export interface RepartoCobro {
  efectivo: number;
  credito: number;
  /** Efectivo más saldo usado. */
  entregado: number;
  /** Lo que se paga de la deuda. */
  aplicado: number;
  /** Lo que sobra y queda a favor del cliente. */
  excedente: number;
  /** Por qué no se puede enviar todavía, con las mismas reglas del servidor. */
  error: string | null;
}

export function repartirCobro({ efectivo, credito, deuda, saldoDisponible }: DatosCobro): RepartoCobro {
  const ef = redondearDinero(efectivo || 0);
  const cr = redondearDinero(credito || 0);
  const tope = redondearDinero(Math.max(0, deuda || 0));
  const entregado = redondearDinero(ef + cr);
  const aplicado = redondearDinero(Math.min(entregado, tope));
  const excedente = redondearDinero(Math.max(0, entregado - aplicado));

  let error: string | null = null;
  if (cr < 0) error = 'El saldo a favor usado no puede ser negativo.';
  else if (ef < 0) error = 'El saldo a favor usado no puede pasar de lo que se paga.';
  else if (entregado <= 0) error = 'El monto debe ser mayor que cero.';
  else if (cr > redondearDinero(saldoDisponible || 0))
    error = `El cliente sólo tiene ${formatCurrency(saldoDisponible || 0)} de saldo a favor.`;
  else if (cr > 0 && excedente > 0)
    error = 'Si usas saldo a favor no puede sobrar dinero: cobra sólo lo que falta para cubrir la deuda.';

  return { efectivo: ef, credito: cr, entregado, aplicado, excedente, error };
}

/**
 * Cuánto saldo a favor usar con el botón «Usar saldo»: lo que cubra la
 * deuda sin pasarse, y no más de lo que el cliente tiene.
 */
export function creditoSugerido(saldoDisponible: number, porCubrir: number): number {
  return redondearDinero(Math.max(0, Math.min(saldoDisponible || 0, porCubrir || 0)));
}

// ---------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------

export const TIPOS_MOVIMIENTO: Record<TipoMovimientoCredito, string> = {
  excedente: 'Excedente de un pago',
  anticipo: 'Anticipo',
  uso: 'Usado en un pago',
  devolucion: 'Devolución',
  anulacion: 'Anulación',
};

/** Referencia de los comprobantes de anticipo y devolución. */
export function referenciaMovimiento(mov: Pick<MovimientoCredito, 'id' | 'tipo'>): string {
  const prefijo = mov.tipo === 'anticipo' ? 'ANT' : mov.tipo === 'devolucion' ? 'DEV' : 'SAF';
  return `${prefijo}-${mov.id.slice(0, 8).toUpperCase()}`;
}
