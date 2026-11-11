import { describe, expect, it } from 'vitest';
import { calcularCuadre, horaDe, moverDia, type DatosCuadre } from './cuadre';
import type { Cliente, Cotizacion, Cuota, Factura, MovimientoCredito, Pago, Prestamo } from '../types';

const RD = 'America/Santo_Domingo';
const DIA = '2026-11-11';

const cliente = (id: string, nombre: string) => ({ id, nombre, activo: true }) as Cliente;

const cuota = (id: string, prestamo: string, numero: number) =>
  ({ id, prestamo_id: prestamo, numero, monto: 600, monto_pagado: 0 }) as Cuota;

const prestamo = (id: string, clienteId: string, inicio: string, monto: number, cuotas: Cuota[]) =>
  ({
    id, cliente_id: clienteId, fecha_inicio: inicio, monto_prestado: monto, num_cuotas: cuotas.length,
    created_at: `${inicio}T14:00:00+00:00`, cuotas,
  }) as unknown as Prestamo;

const pago = (id: string, extra: Partial<Pago>): Pago =>
  ({
    id, factura_id: null, prestamo_id: null, cuota_id: null, monto: 0, monto_mora: 0, credito_usado: 0,
    excedente: 0, metodo: 'efectivo', saldo_de_prestamo: false, referencia: null,
    fecha: `${DIA}T15:00:00+00:00`, created_at: '', ...extra,
  }) as Pago;

const mov = (id: string, tipo: MovimientoCredito['tipo'], monto: number, extra: Partial<MovimientoCredito> = {}) =>
  ({
    id, organizacion_id: 'o', cliente_id: 'c1', tipo, monto, pago_id: null, prestamo_id: null, factura_id: null,
    cuota_id: null, documento: null, metodo: 'efectivo', referencia: null, nota: null,
    fecha: `${DIA}T16:00:00+00:00`, creado_por: null, ...extra,
  }) as MovimientoCredito;

const p1 = prestamo('aaaaaaaa-1111', 'c1', '2026-10-01', 2000, [cuota('q1', 'aaaaaaaa-1111', 1), cuota('q2', 'aaaaaaaa-1111', 2)]);
const p2 = prestamo('bbbbbbbb-2222', 'c2', '2026-10-05', 1000, [cuota('r1', 'bbbbbbbb-2222', 1), cuota('r2', 'bbbbbbbb-2222', 2)]);
const p3 = prestamo('cccccccc-3333', 'c2', DIA, 5000, [cuota('s1', 'cccccccc-3333', 1)]);

const datos: DatosCuadre = {
  clientes: [cliente('c1', 'ANA'), cliente('c2', 'BETO')],
  cotizaciones: [
    { id: 'k1', fecha: DIA, total: 3000 } as Cotizacion,
    { id: 'k2', fecha: '2026-11-10', total: 999 } as Cotizacion,
  ],
  facturas: [{ id: 'f1', numero: 'FAC-2026-0030', cliente_id: 'c2', fecha: DIA, total: 1180 } as Factura],
  prestamos: [p1, p2, p3],
  pagos: [
    // Cuota con mora, en efectivo
    pago('a', { prestamo_id: p1.id, cuota_id: 'q1', monto: 700, monto_mora: 100, fecha: `${DIA}T13:10:00+00:00` }),
    // Cuota con sobrante, por transferencia
    pago('b', { prestamo_id: p1.id, cuota_id: 'q2', monto: 1000, excedente: 400, metodo: 'transferencia' }),
    // Saldo de p2: dos pagos de la misma operación
    pago('c', { prestamo_id: p2.id, cuota_id: 'r1', monto: 600, saldo_de_prestamo: true, fecha: `${DIA}T17:00:00+00:00` }),
    pago('d', { prestamo_id: p2.id, cuota_id: 'r2', monto: 600, saldo_de_prestamo: true, fecha: `${DIA}T17:00:00+00:00` }),
    // Factura pagada en parte con saldo a favor
    pago('e', { factura_id: 'f1', monto: 680, credito_usado: 500, metodo: 'tarjeta' }),
    // 9:30 p. m. del 11 en Santo Domingo (01:30 UTC del 12): es del día 11
    pago('f', { prestamo_id: p1.id, cuota_id: 'q1', monto: 50, fecha: '2026-11-12T01:30:00+00:00' }),
    // Del día anterior: no cuenta
    pago('g', { prestamo_id: p1.id, cuota_id: 'q1', monto: 9999, fecha: '2026-11-10T15:00:00+00:00' }),
    // Pagada toda con saldo: no trae dinero
    pago('h', { prestamo_id: p1.id, cuota_id: 'q2', monto: 0, credito_usado: 200, metodo: 'saldo_a_favor' }),
  ],
  movimientosCredito: [
    mov('m1', 'anticipo', 300, { metodo: 'efectivo' }),
    mov('m2', 'devolucion', -150, { metodo: 'efectivo' }),
    // Excedentes y usos ya están en los pagos: no se cuentan dos veces
    mov('m3', 'excedente', 400),
    mov('m4', 'uso', -500),
  ],
};

describe('cuadre del día', () => {
  const c = calcularCuadre(datos, DIA, RD);

  it('suma lo que entró por cada origen', () => {
    expect(c.entradas).toEqual({ prestamos: 2950, mora: 100, facturas: 680, anticipos: 300, total: 3930 });
  });

  it('suma lo que salió: préstamos entregados y devoluciones', () => {
    expect(c.salidas).toEqual({ prestamosEntregados: 5000, devoluciones: 150, total: 5150 });
    expect(c.neto).toBe(-1220);
  });

  it('separa por método para cuadrar la caja', () => {
    const fila = (m: string) => c.porMetodo.find((f) => f.metodo === m);
    expect(fila('efectivo')).toEqual({ metodo: 'efectivo', entradas: 2250, salidas: 150, neto: 2100 });
    expect(fila('transferencia')?.entradas).toBe(1000);
    expect(fila('tarjeta')?.entradas).toBe(680);
    expect(fila('otro')?.entradas).toBe(0);
  });

  it('informa aparte el saldo a favor usado y los excedentes', () => {
    expect(c.creditoUsado).toBe(700);
    expect(c.excedentes).toBe(400);
  });

  it('un saldo de préstamo va en un solo renglón', () => {
    const saldo = c.renglones.filter((r) => r.tipo === 'saldo');
    expect(saldo).toHaveLength(1);
    expect(saldo[0]).toMatchObject({ entrada: 1200, cliente: 'BETO' });
    expect(saldo[0].concepto).toBe('Saldo del préstamo · PRE-BBBBBBBB (2 cuotas)');
  });

  it('cuenta los cobros de la noche en su día y deja fuera los de otro día', () => {
    expect(c.renglones.some((r) => r.id === 'f')).toBe(true);
    expect(c.renglones.some((r) => r.id === 'g')).toBe(false);
    expect(calcularCuadre(datos, '2026-11-12', RD).renglones.some((r) => r.id === 'f')).toBe(false);
  });

  it('cuenta sólo las operaciones que trajeron dinero', () => {
    // a, b, saldo, e, f y el anticipo; no la pagada con saldo ni las salidas
    expect(c.cobros).toBe(6);
  });

  it('ordena por hora y nombra cada renglón', () => {
    // 9:10 a. m. el cobro, 10:00 a. m. el préstamo entregado
    expect(c.renglones.slice(0, 2).map((r) => r.id)).toEqual(['a', 'cccccccc-3333']);
    expect(c.renglones.at(-1)?.id).toBe('f');
    const cuotaConMora = c.renglones.find((r) => r.id === 'a');
    expect(cuotaConMora).toMatchObject({ concepto: 'Cuota #1 · PRE-AAAAAAAA', cliente: 'ANA', mora: 100 });
  });

  it('resume la actividad del día', () => {
    expect(c.actividad).toEqual({
      cotizaciones: { cantidad: 1, total: 3000 },
      facturas: { cantidad: 1, total: 1180 },
      prestamos: { cantidad: 1, monto: 5000 },
    });
  });

  it('un día sin movimientos da ceros', () => {
    const vacio = calcularCuadre(datos, '2026-01-01', RD);
    expect(vacio.entradas.total).toBe(0);
    expect(vacio.salidas.total).toBe(0);
    expect(vacio.renglones).toEqual([]);
  });
});

describe('utilidades del cuadre', () => {
  it('da la hora de Santo Domingo', () => {
    expect(horaDe('2026-11-12T01:30:00+00:00', RD)).toMatch(/^9:30\s?p/);
    expect(horaDe('2026-11-11T00:00:00', RD)).toBe('');
  });

  it('mueve el día, cruzando meses y años', () => {
    expect(moverDia('2026-11-11', -1)).toBe('2026-11-10');
    expect(moverDia('2026-12-31', 1)).toBe('2027-01-01');
    expect(moverDia('2026-03-01', -1)).toBe('2026-02-28');
  });
});
