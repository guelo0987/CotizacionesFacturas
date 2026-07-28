import { redondearDinero } from './validacion';
import { addDaysToDate } from './sanitizer';
import type { FrecuenciaPrestamo } from '../types';

/**
 * Cálculos de dinero.
 *
 * Estas fórmulas están duplicadas a propósito en el servidor
 * (`supabase/migrations/*_funciones_negocio.sql`), que es quien manda: el
 * cliente sólo las usa para la previsualización en vivo. Deben mantenerse
 * idénticas — de ahí que estén aisladas aquí y con pruebas.
 */

export interface LineaCalculable {
  cantidad: number;
  precio_unitario: number;
}

export interface TotalesDocumento {
  subtotal: number;
  itbis: number;
  total: number;
}

export function calcularImporteLinea(cantidad: number, precioUnitario: number): number {
  return redondearDinero((cantidad || 0) * (precioUnitario || 0));
}

export function calcularTotalesDocumento(
  items: LineaCalculable[],
  aplicaItbis: boolean,
  tasaItbis: number
): TotalesDocumento {
  const subtotal = redondearDinero(
    items.reduce((suma, it) => suma + calcularImporteLinea(it.cantidad, it.precio_unitario), 0)
  );
  const itbis = aplicaItbis ? redondearDinero(subtotal * (tasaItbis / 100)) : 0;
  return { subtotal, itbis, total: redondearDinero(subtotal + itbis) };
}

export interface ResumenPrestamo {
  interesTotal: number;
  totalAPagar: number;
  cuotaBase: number;
  numCuotas: number;
}

/**
 * Interés fijo sobre el capital: no se amortiza ni depende del plazo.
 * Es el modelo de cobro habitual del préstamo informal dominicano, y la
 * interfaz lo rotula explícitamente para que no se confunda con una tasa
 * anual.
 */
export function calcularPrestamo(
  montoPrestado: number,
  tasaInteres: number,
  numCuotas: number
): ResumenPrestamo {
  const monto = Math.max(0, montoPrestado || 0);
  const tasa = Math.max(0, tasaInteres || 0);
  const cuotas = Math.max(1, Math.floor(numCuotas || 1));

  const interesTotal = redondearDinero(monto * (tasa / 100));
  const totalAPagar = redondearDinero(monto + interesTotal);

  return {
    interesTotal,
    totalAPagar,
    cuotaBase: redondearDinero(totalAPagar / cuotas),
    numCuotas: cuotas,
  };
}

export const DIAS_POR_FRECUENCIA: Record<FrecuenciaPrestamo, number> = {
  semanal: 7,
  quincenal: 15,
  mensual: 30,
};

export interface CuotaProyectada {
  numero: number;
  fechaVencimiento: string;
  monto: number;
}

/**
 * Calendario de cuotas. La última absorbe el redondeo para que la suma
 * cuadre exactamente con el total a pagar, sin céntimos perdidos.
 */
export function generarCalendarioCuotas(
  totalAPagar: number,
  numCuotas: number,
  frecuencia: FrecuenciaPrestamo,
  fechaInicio: string
): CuotaProyectada[] {
  const cuotas = Math.max(1, Math.floor(numCuotas || 1));
  const base = redondearDinero(totalAPagar / cuotas);
  const dias = DIAS_POR_FRECUENCIA[frecuencia] ?? 30;

  const calendario: CuotaProyectada[] = [];
  let acumulado = 0;

  for (let i = 1; i <= cuotas; i++) {
    let monto: number;
    if (i === cuotas) {
      monto = redondearDinero(totalAPagar - acumulado);
    } else {
      monto = base;
      acumulado = redondearDinero(acumulado + base);
    }

    calendario.push({
      numero: i,
      fechaVencimiento: addDaysToDate(fechaInicio, dias * i),
      monto,
    });
  }

  return calendario;
}

/** Saldo de una factura tras aplicar un abono. Nunca queda negativo. */
export function calcularSaldoFactura(
  total: number,
  montoPagadoPrevio: number,
  nuevoAbono: number
): { montoPagado: number; saldoPendiente: number; estado: 'pendiente' | 'parcial' | 'pagada' } {
  const montoPagado = redondearDinero(montoPagadoPrevio + nuevoAbono);
  const saldoPendiente = redondearDinero(Math.max(0, total - montoPagado));

  const estado =
    saldoPendiente <= 0 ? 'pagada' : montoPagado > 0 ? 'parcial' : 'pendiente';

  return { montoPagado, saldoPendiente, estado };
}
