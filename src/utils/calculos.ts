import { redondearDinero } from './validacion';
import { addDaysToDate, addMonthsToDate } from './sanitizer';
import type { Cuota, FrecuenciaPrestamo, ModalidadInteres, ModoMora, Prestamo } from '../types';

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

export interface DefinicionModalidad {
  etiqueta: string;
  /** Frase corta para el desplegable, ya con la frecuencia dentro. */
  descripcion: (adjetivo: string) => string;
  /** ¿El capital baja con cada cuota? */
  amortiza: boolean;
}

export const MODALIDADES: Record<ModalidadInteres, DefinicionModalidad> = {
  por_periodo: {
    etiqueta: 'Interés simple por periodo',
    descripcion: (adj) => `Interés ${adj} — se cobra en cada cuota, sobre el capital completo`,
    amortiza: false,
  },
  amortizado: {
    etiqueta: 'Cuota fija amortizada',
    descripcion: (adj) => `Cuota fija amortizada — interés ${adj} sobre el saldo que queda`,
    amortiza: true,
  },
  fijo_total: {
    etiqueta: 'Interés único',
    descripcion: () => 'Interés único sobre el capital — se cobra una sola vez',
    amortiza: false,
  },
};

export const MODALIDADES_VALIDAS = Object.keys(MODALIDADES) as ModalidadInteres[];

export function modalidadSegura(valor: string | null | undefined): ModalidadInteres {
  return valor && valor in MODALIDADES ? (valor as ModalidadInteres) : 'fijo_total';
}

/** Reparto de una cuota entre lo que paga de interés y lo que abona al capital. */
export interface DesgloseCuota {
  numero: number;
  monto: number;
  interes: number;
  capital: number;
  /** Capital que sigue debiéndose después de pagar esta cuota. */
  saldo: number;
}

export interface ResumenPrestamo {
  interesTotal: number;
  totalAPagar: number;
  cuotaBase: number;
  numCuotas: number;
  /** Interés de la primera cuota. En `amortizado` las siguientes bajan. */
  interesPorCuota: number;
  cuotas: DesgloseCuota[];
}

/**
 * Cuota fija del sistema francés: el pago constante que liquida el capital
 * y sus intereses en `n` periodos, cobrando la tasa sobre el saldo vivo.
 *
 *     cuota = capital × i / (1 − (1 + i)^−n)
 */
function cuotaAmortizada(capital: number, tasaPeriodo: number, cuotas: number): number {
  if (tasaPeriodo <= 0) return redondearDinero(capital / cuotas);
  const descuento = Math.pow(1 + tasaPeriodo, -cuotas);
  return redondearDinero((capital * tasaPeriodo) / (1 - descuento));
}

/**
 * Desglose cuota por cuota. Es la única fuente de verdad de los números del
 * préstamo: el resumen se deriva de aquí, no al revés.
 *
 * En las tres modalidades la última cuota absorbe el redondeo, de modo que
 * el saldo cierra exactamente en cero y no queda ningún céntimo colgando.
 */
export function calcularDesgloseCuotas(
  montoPrestado: number,
  tasaInteres: number,
  numCuotas: number,
  modalidad: ModalidadInteres = 'fijo_total'
): DesgloseCuota[] {
  const capital = Math.max(0, montoPrestado || 0);
  const tasa = Math.max(0, tasaInteres || 0) / 100;
  const n = Math.max(1, Math.floor(numCuotas || 1));

  // Interés que carga cada cuota cuando el capital no se amortiza.
  const interesFijoPorCuota =
    modalidad === 'por_periodo'
      ? redondearDinero(capital * tasa)
      : modalidad === 'fijo_total'
      ? redondearDinero((capital * tasa) / n)
      : 0;

  const cuotaFija = modalidad === 'amortizado' ? cuotaAmortizada(capital, tasa, n) : 0;
  const capitalPorCuota = redondearDinero(capital / n);

  const desglose: DesgloseCuota[] = [];
  let saldo = capital;
  let interesAcumulado = 0;

  for (let numero = 1; numero <= n; numero++) {
    const ultima = numero === n;

    // Sobre el saldo vivo en la cuota fija amortizada; sobre el capital
    // completo cuando el préstamo no amortiza.
    let interes = modalidad === 'amortizado'
      ? redondearDinero(saldo * tasa)
      : interesFijoPorCuota;

    let abonoCapital = ultima
      ? saldo
      : modalidad === 'amortizado'
      ? redondearDinero(cuotaFija - interes)
      : capitalPorCuota;

    if (ultima && modalidad === 'fijo_total') {
      // El interés único no se reparte en partes exactas: el resto cae aquí.
      interes = redondearDinero(capital * tasa - interesAcumulado);
    }

    // Con tasas muy altas y plazos largos la cuota apenas cubre el interés;
    // nunca se deja que el capital crezca.
    if (abonoCapital < 0) abonoCapital = 0;

    interesAcumulado = redondearDinero(interesAcumulado + interes);
    saldo = redondearDinero(saldo - abonoCapital);

    desglose.push({
      numero,
      monto: redondearDinero(abonoCapital + interes),
      interes,
      capital: abonoCapital,
      saldo,
    });
  }

  return desglose;
}

/**
 * Resumen del préstamo. Tres formas de cobrar, todas con interés simple
 * (nunca se capitaliza el interés impagado):
 *
 * - `por_periodo`: la tasa se cobra en cada cuota sobre el capital completo.
 *   10% quincenal a 4 cuotas quincenales son 40% de interés. Es el modelo
 *   del prestamista dominicano y el capital no baja hasta la última cuota.
 * - `amortizado`: cuota fija del sistema francés. La tasa se cobra sobre el
 *   saldo que queda, así que el interés baja cuota a cuota. Es lo que usan
 *   los bancos.
 * - `fijo_total`: la tasa se cobra una sola vez, sin importar el plazo.
 */
export function calcularPrestamo(
  montoPrestado: number,
  tasaInteres: number,
  numCuotas: number,
  modalidad: ModalidadInteres = 'fijo_total'
): ResumenPrestamo {
  const cuotas = calcularDesgloseCuotas(montoPrestado, tasaInteres, numCuotas, modalidad);

  const interesTotal = redondearDinero(cuotas.reduce((suma, c) => suma + c.interes, 0));
  const totalAPagar = redondearDinero(cuotas.reduce((suma, c) => suma + c.monto, 0));

  return {
    interesTotal,
    totalAPagar,
    cuotaBase: cuotas[0].monto,
    numCuotas: cuotas.length,
    interesPorCuota: cuotas[0].interes,
    cuotas,
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

// =====================================================================
// Mora por atraso
// =====================================================================

export interface DefinicionModoMora {
  etiqueta: string;
  detalle: string;
}

export const MODOS_MORA: Record<ModoMora, DefinicionModoMora> = {
  por_cuota: {
    etiqueta: 'Por cada cuota atrasada',
    detalle: 'Cada cuota vencida acumula su propia mora diaria',
  },
  por_prestamo: {
    etiqueta: 'Una sola, aunque haya varias',
    detalle: 'Una mora diaria mientras el préstamo tenga algo atrasado',
  },
};

export const MODOS_MORA_VALIDOS = Object.keys(MODOS_MORA) as ModoMora[];

export function modoMoraSeguro(valor: string | null | undefined): ModoMora {
  return valor === 'por_prestamo' ? 'por_prestamo' : 'por_cuota';
}

/**
 * Días de atraso que generan mora en una cuota.
 *
 * La mora nunca es retroactiva: cuenta desde el día en que se habilitó
 * (`mora_desde`) o desde el vencimiento de la cuota, lo que ocurra más
 * tarde. Así, activarla en un préstamo atrasado hace meses no hace
 * aparecer de golpe una deuda que el cliente nunca supo que tenía.
 */
export function diasDeMora(
  fechaVencimiento: string,
  moraDesde: string | null | undefined,
  hoy: string,
  retroactiva = false
): number {
  if (!fechaVencimiento) return 0;

  const dia = (iso: string) => {
    const [a, m, d] = iso.split('T')[0].split('-').map(Number);
    return Number.isFinite(a) && Number.isFinite(m) && Number.isFinite(d)
      ? Date.UTC(a, m - 1, d)
      : Number.NaN;
  };

  const vence = dia(fechaVencimiento);
  const desde = moraDesde ? dia(moraDesde) : vence;
  const ahora = dia(hoy);
  if (!Number.isFinite(vence) || !Number.isFinite(ahora)) return 0;

  // Retroactiva: cuenta desde el vencimiento de la cuota, alcanzando los
  // atrasos anteriores a habilitarla.
  const arranque = retroactiva ? vence : Math.max(vence, Number.isFinite(desde) ? desde : vence);
  return Math.max(0, Math.round((ahora - arranque) / 86_400_000));
}

/** Mora que aún se le debe a una cuota: lo acumulado menos lo ya cobrado. */
export function moraPendiente(cuota: Cuota): number {
  return redondearDinero(Math.max(0, (cuota.mora_acumulada || 0) - (cuota.mora_pagada || 0)));
}

/** Mora pendiente de todo el préstamo. */
export function moraPendientePrestamo(prestamo: Prestamo): number {
  return redondearDinero(
    (prestamo.cuotas ?? []).reduce((suma, c) => suma + moraPendiente(c), 0)
  );
}

/** Mora ya cobrada en todo el préstamo. */
export function moraCobradaPrestamo(prestamo: Prestamo): number {
  return redondearDinero(
    (prestamo.cuotas ?? []).reduce((suma, c) => suma + (c.mora_pagada || 0), 0)
  );
}

/**
 * Mora que le corresponde a una cuota a día de hoy.
 *
 * Reproduce la fórmula del servidor (`acumular_mora` en SQL), que es quien
 * la guarda: aquí sólo sirve para la vista previa y para explicarle al
 * cobrador de dónde sale la cifra.
 */
export function calcularMoraCuota(
  prestamo: Prestamo,
  cuota: Cuota,
  hoy: string
): { dias: number; monto: number } {
  if (!prestamo.mora_activa || !prestamo.mora_desde || cuota.estado === 'pagada') {
    return { dias: 0, monto: redondearDinero(cuota.mora_acumulada || 0) };
  }

  const dias = diasDeMora(
    cuota.fecha_vencimiento,
    prestamo.mora_desde,
    hoy,
    prestamo.mora_retroactiva
  );
  return { dias, monto: redondearDinero(Math.max(0, prestamo.mora_diaria || 0) * dias) };
}

/**
 * Cuánto cobraría la mora si se habilitara ahora con estos ajustes.
 *
 * Sirve para que el cobrador vea la cifra ANTES de activarla: con la
 * opción retroactiva puede ser una cantidad considerable, y verla
 * convierte la decisión en una elección en vez de una sorpresa.
 */
export function simularMora(
  prestamo: Prestamo,
  diaria: number,
  modo: ModoMora,
  retroactiva: boolean,
  hoy: string
): { total: number; cuotas: number } {
  const vencidas = (prestamo.cuotas ?? [])
    .filter((c) => c.estado !== 'pagada' && c.fecha_vencimiento.split('T')[0] < hoy)
    .sort(
      (a, b) =>
        a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.numero - b.numero
    );

  // Con una sola mora para todo el préstamo, sólo corre la más antigua.
  const aplicables = modo === 'por_prestamo' ? vencidas.slice(0, 1) : vencidas;
  const desde = prestamo.mora_desde ?? hoy;

  const total = aplicables.reduce(
    (suma, c) =>
      suma + Math.max(0, diaria) * diasDeMora(c.fecha_vencimiento, desde, hoy, retroactiva),
    0
  );

  return { total: redondearDinero(total), cuotas: aplicables.length };
}
