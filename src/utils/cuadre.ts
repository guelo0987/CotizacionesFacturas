import type { AppState, MetodoCobro, MetodoPago } from '../types';
import { ZONA_NEGOCIO, diaLocal } from './sanitizer';
import { redondearDinero } from './validacion';
import { referenciaPrestamo } from './documentosPrestamo';

/**
 * Cuadre del día: cuánto dinero entró y salió en una fecha.
 *
 * El día es el local (el de Santo Domingo): un cobro de las 9 p. m. es de
 * ese día aunque en UTC ya sea el siguiente. Sólo cuenta dinero de verdad:
 * lo que se pagó con saldo a favor se informa aparte, porque ese dinero ya
 * había entrado el día en que el cliente lo dejó.
 */

export type DatosCuadre = Pick<
  AppState,
  'clientes' | 'cotizaciones' | 'facturas' | 'prestamos' | 'pagos' | 'movimientosCredito'
>;

export type TipoRenglonCuadre = 'cuota' | 'saldo' | 'factura' | 'anticipo' | 'devolucion' | 'prestamo';

export interface RenglonCuadre {
  id: string;
  /** Instante del movimiento; los préstamos entregados sólo tienen el día. */
  fecha: string;
  tipo: TipoRenglonCuadre;
  cliente: string;
  concepto: string;
  metodo: MetodoPago | null;
  /** Dinero que entró. */
  entrada: number;
  /** Dinero que salió. */
  salida: number;
  /** Parte del cobro que fue a la mora. */
  mora: number;
  /** Lo pagado con saldo a favor: no es dinero nuevo. */
  creditoUsado: number;
  /** Lo que el cliente dio de más y quedó a su favor; ya va dentro de `entrada`. */
  excedente: number;
}

export interface FilaMetodo {
  metodo: MetodoCobro;
  entradas: number;
  salidas: number;
  neto: number;
}

export interface Cuadre {
  dia: string;
  entradas: {
    prestamos: number;
    /** De lo cobrado en préstamos, cuánto fue mora. */
    mora: number;
    facturas: number;
    anticipos: number;
    total: number;
  };
  salidas: {
    prestamosEntregados: number;
    devoluciones: number;
    total: number;
  };
  neto: number;
  /** Cuántas operaciones trajeron dinero. */
  cobros: number;
  porMetodo: FilaMetodo[];
  creditoUsado: number;
  excedentes: number;
  actividad: {
    cotizaciones: { cantidad: number; total: number };
    facturas: { cantidad: number; total: number };
    prestamos: { cantidad: number; monto: number };
  };
  /** Todo lo que pasó ese día, en orden de hora. */
  renglones: RenglonCuadre[];
}

export const METODOS_CUADRE: MetodoCobro[] = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

const suma = (valores: number[]) => redondearDinero(valores.reduce((a, v) => a + (Number(v) || 0), 0));

export function calcularCuadre(datos: DatosCuadre, dia: string, zonaHoraria: string = ZONA_NEGOCIO): Cuadre {
  const delDia = (fecha: string | null | undefined) => !!fecha && diaLocal(fecha, zonaHoraria) === dia;
  const nombreCliente = (id: string | null | undefined) =>
    datos.clientes.find((c) => c.id === id)?.nombre ?? 'Cliente sin asignar';

  const renglones: RenglonCuadre[] = [];

  // Cobros de préstamos. Un saldo genera un pago por cuota en la misma
  // operación: en el cuadre va en un solo renglón.
  const saldos = new Map<string, RenglonCuadre & { cuotas: number }>();
  for (const pago of datos.pagos) {
    if (!delDia(pago.fecha)) continue;
    const base = {
      fecha: pago.fecha,
      metodo: pago.metodo,
      entrada: Number(pago.monto) || 0,
      salida: 0,
      creditoUsado: Number(pago.credito_usado) || 0,
      excedente: Number(pago.excedente) || 0,
    };

    if (pago.factura_id) {
      const factura = datos.facturas.find((f) => f.id === pago.factura_id);
      renglones.push({
        ...base,
        id: pago.id,
        tipo: 'factura',
        cliente: nombreCliente(factura?.cliente_id),
        concepto: `Factura ${factura?.numero ?? ''}`.trim(),
        mora: 0,
      });
      continue;
    }

    const prestamo = datos.prestamos.find((p) => p.id === pago.prestamo_id);
    const referencia = prestamo ? referenciaPrestamo(prestamo) : 'Préstamo';
    const mora = Number(pago.monto_mora) || 0;

    if (pago.saldo_de_prestamo) {
      const clave = `${pago.prestamo_id}|${pago.fecha}`;
      const previo = saldos.get(clave);
      if (previo) {
        previo.entrada += base.entrada;
        previo.creditoUsado += base.creditoUsado;
        previo.excedente += base.excedente;
        previo.mora += mora;
        previo.cuotas += 1;
      } else {
        saldos.set(clave, {
          ...base,
          id: pago.id,
          tipo: 'saldo',
          cliente: nombreCliente(prestamo?.cliente_id),
          concepto: referencia,
          mora,
          cuotas: 1,
        });
      }
      continue;
    }

    const cuota = prestamo?.cuotas?.find((c) => c.id === pago.cuota_id);
    renglones.push({
      ...base,
      id: pago.id,
      tipo: 'cuota',
      cliente: nombreCliente(prestamo?.cliente_id),
      concepto: `Cuota${cuota ? ` #${cuota.numero}` : ''} · ${referencia}`,
      mora,
    });
  }

  for (const { cuotas, ...saldo } of saldos.values()) {
    renglones.push({
      ...saldo,
      concepto: `Saldo del préstamo · ${saldo.concepto} (${cuotas} ${cuotas === 1 ? 'cuota' : 'cuotas'})`,
      entrada: redondearDinero(saldo.entrada),
      creditoUsado: redondearDinero(saldo.creditoUsado),
      excedente: redondearDinero(saldo.excedente),
      mora: redondearDinero(saldo.mora),
    });
  }

  // Anticipos y devoluciones de saldo a favor: dinero que entra y que sale
  for (const mov of datos.movimientosCredito) {
    if (!delDia(mov.fecha)) continue;
    if (mov.tipo !== 'anticipo' && mov.tipo !== 'devolucion') continue;
    const monto = Math.abs(Number(mov.monto) || 0);
    const esAnticipo = mov.tipo === 'anticipo';
    renglones.push({
      id: mov.id,
      fecha: mov.fecha,
      tipo: mov.tipo,
      cliente: nombreCliente(mov.cliente_id),
      concepto: esAnticipo ? 'Anticipo (queda a su favor)' : 'Devolución de saldo a favor',
      metodo: mov.metodo,
      entrada: esAnticipo ? monto : 0,
      salida: esAnticipo ? 0 : monto,
      mora: 0,
      creditoUsado: 0,
      excedente: 0,
    });
  }

  // Préstamos entregados: el dinero sale el día de inicio del préstamo
  const prestamosDelDia = datos.prestamos.filter((p) => p.fecha_inicio === dia);
  for (const prestamo of prestamosDelDia) {
    renglones.push({
      id: prestamo.id,
      fecha: prestamo.created_at && delDia(prestamo.created_at) ? prestamo.created_at : `${dia}T00:00:00`,
      tipo: 'prestamo',
      cliente: nombreCliente(prestamo.cliente_id),
      concepto: `Préstamo entregado · ${referenciaPrestamo(prestamo)} (${prestamo.num_cuotas} cuotas)`,
      metodo: null,
      entrada: 0,
      salida: Number(prestamo.monto_prestado) || 0,
      mora: 0,
      creditoUsado: 0,
      excedente: 0,
    });
  }

  renglones.sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha) || a.id.localeCompare(b.id));

  const deTipo = (...tipos: TipoRenglonCuadre[]) => renglones.filter((r) => tipos.includes(r.tipo));
  const entradas = {
    prestamos: suma(deTipo('cuota', 'saldo').map((r) => r.entrada)),
    mora: suma(deTipo('cuota', 'saldo').map((r) => r.mora)),
    facturas: suma(deTipo('factura').map((r) => r.entrada)),
    anticipos: suma(deTipo('anticipo').map((r) => r.entrada)),
    total: suma(renglones.map((r) => r.entrada)),
  };
  const salidas = {
    prestamosEntregados: suma(deTipo('prestamo').map((r) => r.salida)),
    devoluciones: suma(deTipo('devolucion').map((r) => r.salida)),
    total: suma(renglones.map((r) => r.salida)),
  };

  // Por método sólo cuenta lo que tiene método: un préstamo entregado no lo
  // registra, y lo pagado con saldo a favor no es dinero
  const porMetodo = METODOS_CUADRE.map((metodo) => {
    const propios = renglones.filter((r) => r.metodo === metodo);
    const ent = suma(propios.map((r) => r.entrada));
    const sal = suma(propios.map((r) => r.salida));
    return { metodo, entradas: ent, salidas: sal, neto: redondearDinero(ent - sal) };
  });

  const cotizacionesDia = datos.cotizaciones.filter((c) => delDia(c.fecha));
  const facturasDia = datos.facturas.filter((f) => delDia(f.fecha));

  return {
    dia,
    entradas,
    salidas,
    neto: redondearDinero(entradas.total - salidas.total),
    cobros: renglones.filter((r) => r.entrada > 0).length,
    porMetodo,
    creditoUsado: suma(renglones.map((r) => r.creditoUsado)),
    excedentes: suma(renglones.map((r) => r.excedente)),
    actividad: {
      cotizaciones: { cantidad: cotizacionesDia.length, total: suma(cotizacionesDia.map((c) => c.total)) },
      facturas: { cantidad: facturasDia.length, total: suma(facturasDia.map((f) => f.total)) },
      prestamos: {
        cantidad: prestamosDelDia.length,
        monto: suma(prestamosDelDia.map((p) => p.monto_prestado)),
      },
    },
    renglones,
  };
}

/** Hora local de un movimiento («3:45 p. m.»); vacía si sólo se conoce el día. */
export function horaDe(fecha: string, zonaHoraria: string = ZONA_NEGOCIO): string {
  if (!/T\d{2}:\d{2}/.test(fecha) || /T00:00:00$/.test(fecha)) return '';
  const momento = new Date(fecha);
  if (Number.isNaN(momento.getTime())) return '';
  return new Intl.DateTimeFormat('es-DO', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zonaHoraria,
  }).format(momento);
}

/** «miércoles, 11 de noviembre de 2026» */
export function fechaLarga(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Intl.DateTimeFormat('es-DO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(a, m - 1, d)));
}

/** Día anterior o siguiente de una fecha AAAA-MM-DD. */
export function moverDia(dia: string, dias: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d + dias));
  return fecha.toISOString().slice(0, 10);
}
