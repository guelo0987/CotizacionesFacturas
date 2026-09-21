import { describe, expect, it } from 'vitest';
import { estadoTrasPago } from './documentosPrestamo';
import { diaLocal } from './sanitizer';
import type { Cuota, Pago, Prestamo } from '../types';

describe('diaLocal', () => {
  it('respeta las fechas sin hora', () => {
    expect(diaLocal('2026-09-21', 'America/Santo_Domingo')).toBe('2026-09-21');
  });

  it('da el día de Santo Domingo a un pago cobrado de noche', () => {
    // 01:30 UTC del 22 son las 9:30 p. m. del 21 en RD
    expect(diaLocal('2026-09-22T01:30:00+00:00', 'America/Santo_Domingo')).toBe('2026-09-21');
    expect(diaLocal('2026-09-22T01:30:00+00:00', 'UTC')).toBe('2026-09-22');
  });

  it('entiende el formato de Postgres, con microsegundos y zona abreviada', () => {
    expect(diaLocal('2026-09-22 01:30:00.190387+00', 'America/Santo_Domingo')).toBe('2026-09-21');
    expect(diaLocal('2026-09-22T01:30:00.190387Z', 'America/Santo_Domingo')).toBe('2026-09-21');
  });

  it('no mueve los pagos hechos de día', () => {
    expect(diaLocal('2026-09-21T12:28:32.190387+00:00', 'America/Santo_Domingo')).toBe('2026-09-21');
  });

  it('no inventa nada con un valor que no es fecha', () => {
    expect(diaLocal('', 'America/Santo_Domingo')).toBe('');
  });
});

describe('estadoTrasPago', () => {
  // El préstamo de la prueba completa: RD$10,000 a 4 cuotas semanales con
  // cuota fija, la #1 pagada con su mora, un abono parcial a la #2 y el
  // resto liquidado de una vez al saldar.
  const cuota = (numero: number, monto: number, pagado: number): Cuota =>
    ({
      id: `q${numero}`, prestamo_id: 'p1', numero, fecha_vencimiento: '2026-09-09',
      monto, mora_acumulada: 0, mora_pagada: 0, interes: 0, capital: 0,
      saldo_capital: 0, monto_pagado: pagado, estado: 'pagada',
    }) as Cuota;

  const pago = (id: string, cuotaId: string, monto: number, mora: number, fecha: string, saldo = false): Pago =>
    ({
      id, prestamo_id: 'p1', cuota_id: cuotaId, monto, monto_mora: mora, fecha,
      metodo: 'efectivo', saldo_de_prestamo: saldo, referencia: null, created_at: fecha,
    }) as Pago;

  const cuotas = [
    cuota(1, 3154.71, 3154.71),
    cuota(2, 3154.71, 3154.71),
    cuota(3, 3154.71, 3154.71),
    cuota(4, 3154.7, 3154.7),
  ];

  const pagos = [
    pago('a', 'q1', 4354.71, 1200, '2026-09-21T12:28:32.190387+00:00'),
    pago('b', 'q2', 1000, 0, '2026-09-21T12:29:59.372846+00:00'),
    // Los tres pagos del saldo nacen en la misma operación
    pago('c', 'q2', 2654.71, 500, '2026-09-21T12:30:28.250624+00:00', true),
    pago('d', 'q3', 3154.71, 0, '2026-09-21T12:30:28.250624+00:00', true),
    pago('e', 'q4', 3154.7, 0, '2026-09-21T12:30:28.250624+00:00', true),
  ];

  const prestamo = (lista?: Pago[]): Prestamo =>
    ({
      id: 'p1', cliente_id: 'c1', monto_prestado: 10000, tasa_interes: 10,
      modalidad_interes: 'amortizado', interes_total: 2618.83, total_a_pagar: 12618.83,
      num_cuotas: 4, frecuencia: 'semanal', fecha_inicio: '2026-09-02',
      mora_activa: true, mora_diaria: 100, mora_modo: 'por_cuota', mora_desde: '2026-09-21',
      mora_retroactiva: true, estado: 'saldado', created_at: '', cuotas, pagos: lista,
    }) as Prestamo;

  it('el recibo de la primera cuota no dice «saldado» aunque hoy lo esté', () => {
    const estado = estadoTrasPago(prestamo(pagos), cuotas[0], pagos[0]);
    expect(estado.abonadoCuota).toBe(3154.71);
    expect(estado.restaCuota).toBe(0);
    // La mora no cuenta como abono al préstamo
    expect(estado.abonadoTotal).toBe(3154.71);
    expect(estado.saldoPrestamo).toBe(9464.12);
    expect(estado.esElUltimo).toBe(false);
  });

  it('un abono parcial deja la cuota y el préstamo como quedaron ese momento', () => {
    const estado = estadoTrasPago(prestamo(pagos), cuotas[1], pagos[1]);
    expect(estado.abonadoCuota).toBe(1000);
    expect(estado.restaCuota).toBe(2154.71);
    expect(estado.abonadoTotal).toBe(4154.71);
    expect(estado.saldoPrestamo).toBe(8464.12);
    expect(estado.esElUltimo).toBe(false);
  });

  it('los pagos del saldo cuentan juntos: tras ellos no queda nada', () => {
    const estado = estadoTrasPago(prestamo(pagos), cuotas[2], pagos[3]);
    expect(estado.abonadoTotal).toBe(12618.83);
    expect(estado.saldoPrestamo).toBe(0);
    expect(estado.esElUltimo).toBe(true);
  });

  it('el último abono coincide con el estado de hoy', () => {
    const hastaElParcial = pagos.slice(0, 2);
    const estado = estadoTrasPago(prestamo(hastaElParcial), cuotas[1], pagos[1]);
    expect(estado.esElUltimo).toBe(true);
    expect(estado.saldoPrestamo).toBe(8464.12);
  });

  it('cuenta el pago aunque todavía no esté en el historial cargado', () => {
    const estado = estadoTrasPago(prestamo([pagos[0]]), cuotas[1], pagos[1]);
    expect(estado.abonadoTotal).toBe(4154.71);
    expect(estado.esElUltimo).toBe(true);
  });

  it('sin historial de pagos da el estado de hoy', () => {
    const estado = estadoTrasPago(prestamo(undefined), cuotas[0], pagos[0]);
    expect(estado.abonadoTotal).toBe(12618.83);
    expect(estado.saldoPrestamo).toBe(0);
    expect(estado.esElUltimo).toBe(true);
  });
});
