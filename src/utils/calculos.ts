import { redondearDinero } from './validacion';
import { addDaysToDate, addMonthsToDate } from './sanitizer';
import type { FrecuenciaPrestamo, ModalidadInteres } from '../types';

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

// =====================================================================
// Préstamos
// =====================================================================

export interface DefinicionFrecuencia {
  etiqueta: string;
  /** Cómo se lee la tasa: «10% quincenal». */
  adjetivo: string;
  /** Cómo se leen las cuotas: «4 cuotas quincenales». */
  plural: string;
  detalle: string;
  /** Avance del vencimiento: en días o en meses de calendario, no ambos. */
  dias?: number;
  meses?: number;
  /** Cuántas veces se repite el periodo en un año (tasa anual equivalente). */
  periodosPorAnio: number;
}

/**
 * Frecuencias de cobro admitidas.
 *
 * Los periodos de un mes o más avanzan por calendario (el 31 de enero
 * vence el 28 de febrero), no por bloques de 30 días: es lo que espera
 * quien cobra «el mismo día de cada mes» y coincide con el `interval` que
 * usa PostgreSQL al generar el calendario definitivo.
 */
export const FRECUENCIAS: Record<FrecuenciaPrestamo, DefinicionFrecuencia> = {
  diario: {
    etiqueta: 'Diaria', adjetivo: 'diario', plural: 'diarias',
    detalle: 'cada día', dias: 1, periodosPorAnio: 365,
  },
  semanal: {
    etiqueta: 'Semanal', adjetivo: 'semanal', plural: 'semanales',
    detalle: 'cada 7 días', dias: 7, periodosPorAnio: 52,
  },
  quincenal: {
    etiqueta: 'Quincenal', adjetivo: 'quincenal', plural: 'quincenales',
    detalle: 'cada 15 días', dias: 15, periodosPorAnio: 24,
  },
  mensual: {
    etiqueta: 'Mensual', adjetivo: 'mensual', plural: 'mensuales',
    detalle: 'el mismo día cada mes', meses: 1, periodosPorAnio: 12,
  },
  bimestral: {
    etiqueta: 'Bimestral', adjetivo: 'bimestral', plural: 'bimestrales',
    detalle: 'cada 2 meses', meses: 2, periodosPorAnio: 6,
  },
  trimestral: {
    etiqueta: 'Trimestral', adjetivo: 'trimestral', plural: 'trimestrales',
    detalle: 'cada 3 meses', meses: 3, periodosPorAnio: 4,
  },
  semestral: {
    etiqueta: 'Semestral', adjetivo: 'semestral', plural: 'semestrales',
    detalle: 'cada 6 meses', meses: 6, periodosPorAnio: 2,
  },
  anual: {
    etiqueta: 'Anual', adjetivo: 'anual', plural: 'anuales',
    detalle: 'una vez al año', meses: 12, periodosPorAnio: 1,
  },
};

export const FRECUENCIAS_VALIDAS = Object.keys(FRECUENCIAS) as FrecuenciaPrestamo[];

/** Frecuencia siempre válida: protege de datos viejos o corruptos. */
export function frecuenciaSegura(valor: string | null | undefined): FrecuenciaPrestamo {
  return valor && valor in FRECUENCIAS ? (valor as FrecuenciaPrestamo) : 'mensual';
}

export function modalidadSegura(valor: string | null | undefined): ModalidadInteres {
  return valor === 'por_periodo' || valor === 'fijo_total' ? valor : 'fijo_total';
}

export interface ResumenPrestamo {
  interesTotal: number;
  totalAPagar: number;
  cuotaBase: number;
  numCuotas: number;
  /** Interés que carga cada cuota (0 en la modalidad de interés fijo). */
  interesPorCuota: number;
}

/**
 * Interés simple sobre el capital: nunca se amortiza, el capital no baja
 * al abonar. Es el modelo de cobro del préstamo informal dominicano.
 *
 * - `por_periodo`: la tasa se cobra en cada cuota. 10% quincenal a 4 cuotas
 *   quincenales son 40% de interés sobre el capital.
 * - `fijo_total`: la tasa se cobra una sola vez, sin importar el plazo ni
 *   la frecuencia.
 */
export function calcularPrestamo(
  montoPrestado: number,
  tasaInteres: number,
  numCuotas: number,
  modalidad: ModalidadInteres = 'fijo_total'
): ResumenPrestamo {
  const monto = Math.max(0, montoPrestado || 0);
  const tasa = Math.max(0, tasaInteres || 0);
  const cuotas = Math.max(1, Math.floor(numCuotas || 1));

  const interesPorCuota = modalidad === 'por_periodo' ? redondearDinero(monto * (tasa / 100)) : 0;
  const interesTotal =
    modalidad === 'por_periodo'
      ? redondearDinero(monto * (tasa / 100) * cuotas)
      : redondearDinero(monto * (tasa / 100));
  const totalAPagar = redondearDinero(monto + interesTotal);

  return {
    interesTotal,
    totalAPagar,
    cuotaBase: redondearDinero(totalAPagar / cuotas),
    numCuotas: cuotas,
    interesPorCuota,
  };
}

/**
 * Tasa simple anual equivalente, para que se vea de un vistazo lo que
 * cuesta el préstamo. Sólo tiene sentido con la tasa por periodo.
 */
export function tasaAnualEquivalente(
  tasaInteres: number,
  frecuencia: FrecuenciaPrestamo
): number {
  const tasa = Math.max(0, tasaInteres || 0);
  return redondearDinero(tasa * FRECUENCIAS[frecuenciaSegura(frecuencia)].periodosPorAnio);
}

/** Vencimiento de la cuota `numero` (1 = primera) según la frecuencia. */
export function vencimientoDeCuota(
  fechaInicio: string,
  frecuencia: FrecuenciaPrestamo,
  numero: number
): string {
  const def = FRECUENCIAS[frecuenciaSegura(frecuencia)];
  return def.meses
    ? addMonthsToDate(fechaInicio, def.meses * numero)
    : addDaysToDate(fechaInicio, (def.dias ?? 30) * numero);
}

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
      fechaVencimiento: vencimientoDeCuota(fechaInicio, frecuencia, i),
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
