import { describe, expect, it } from 'vitest';
import {
  capitalPendiente,
  esRedito,
  estadoTrasPago,
  etiquetaCuota,
  etiquetaCuotaDe,
  plazoPrestamo,
  reditoActual,
  repartoRedito,
} from './documentosPrestamo';
import { calcularPrestamo, MODALIDADES_CON_PLAZO } from './calculos';
import { calcularCuadre } from './cuadre';
import { clientesPorCobrar } from './cobros';
import type { Cuota, Pago, Prestamo } from '../types';

// El ejemplo que se le explicó al negocio: RD$10,000 al 10% mensual
const capital = {
  id: 'cap', prestamo_id: 'p', numero: 9999, fecha_vencimiento: '9999-12-31', monto: 10000, monto_pagado: 2000,
  interes: 0, capital: 10000, saldo_capital: 0, mora_acumulada: 0, mora_pagada: 0, estado: 'parcial', es_capital: true,
} as Cuota;
const redito1 = {
  id: 'r1', prestamo_id: 'p', numero: 1, fecha_vencimiento: '2026-11-25', monto: 1000, monto_pagado: 1000,
  interes: 1000, capital: 0, saldo_capital: 10000, mora_acumulada: 0, mora_pagada: 0, estado: 'pagada',
} as Cuota;
const redito2 = {
  id: 'r2', prestamo_id: 'p', numero: 2, fecha_vencimiento: '2026-12-25', monto: 800, monto_pagado: 0,
  interes: 800, capital: 0, saldo_capital: 8000, mora_acumulada: 0, mora_pagada: 0, estado: 'pendiente',
} as Cuota;

const pago = (id: string, cuota: string, monto: number, fecha: string): Pago =>
  ({
    id, prestamo_id: 'pppppppp-1', factura_id: null, cuota_id: cuota, monto, monto_mora: 0, credito_usado: 0, excedente: 0,
    metodo: 'efectivo', referencia: null, saldo_de_prestamo: false, fecha, created_at: fecha,
  }) as Pago;

const prestamo = {
  id: 'pppppppp-1', cliente_id: 'c', monto_prestado: 10000, tasa_interes: 10, modalidad_interes: 'redito',
  frecuencia: 'mensual', num_cuotas: 2, interes_total: 1800, total_a_pagar: 11800, estado: 'activo',
  fecha_inicio: '2026-10-25', cuotas: [redito1, redito2, capital],
  pagos: [pago('a', 'r1', 1000, '2026-11-25T15:00:00Z'), pago('b', 'cap', 2000, '2026-11-25T15:00:00Z')],
} as unknown as Prestamo;

const fijo = { ...prestamo, modalidad_interes: 'por_periodo', num_cuotas: 4 } as Prestamo;

describe('préstamo a rédito', () => {
  it('se reconoce y no aparece entre las formas de interés con plazo', () => {
    expect(esRedito(prestamo)).toBe(true);
    expect(esRedito(fijo)).toBe(false);
    expect(MODALIDADES_CON_PLAZO).not.toContain('redito');
  });

  it('nombra cada cuota según el tipo de préstamo', () => {
    expect(etiquetaCuota(redito2, prestamo)).toBe('Rédito #2');
    expect(etiquetaCuota(capital, prestamo)).toBe('Capital');
    expect(etiquetaCuota(redito2, fijo)).toBe('Cuota #2');
    expect(etiquetaCuotaDe(redito2, prestamo)).toBe('Rédito #2');
    expect(etiquetaCuotaDe(redito2, fijo)).toBe('Cuota #2 de 4');
  });

  it('el plazo es indefinido', () => {
    expect(plazoPrestamo(prestamo)).toBe('Plazo indefinido');
    expect(plazoPrestamo(fijo)).toBe('4 cuotas');
  });

  it('sabe cuánto debe de capital y cuánto es el rédito de hoy', () => {
    expect(capitalPendiente(prestamo)).toBe(8000);
    expect(reditoActual(prestamo)).toBe(800);
  });

  it('el recibo muestra el capital que quedó debiendo tras cada pago', () => {
    expect(estadoTrasPago(prestamo, capital, prestamo.pagos![1]).capitalPendiente).toBe(8000);
    expect(estadoTrasPago(fijo, redito1, prestamo.pagos![0]).capitalPendiente).toBeNull();
  });

  it('la vista previa muestra el rédito del primer periodo', () => {
    const calculo = calcularPrestamo(10000, 10, 99, 'redito');
    expect(calculo.interesPorCuota).toBe(1000);
    expect(calculo.numCuotas).toBe(1);
  });

  it('el cuadre nombra el rédito y el abono a capital', () => {
    const cuadre = calcularCuadre(
      { clientes: [], cotizaciones: [], facturas: [], prestamos: [prestamo], pagos: prestamo.pagos!, movimientosCredito: [] },
      '2026-11-25'
    );
    expect(cuadre.entradas.prestamos).toBe(3000);
    expect(cuadre.renglones.map((r) => r.concepto.split(' · ')[0]).sort()).toEqual(['Capital', 'Rédito #1']);
  });

  it('la campanita avisa el rédito pero nunca el capital, que no vence', () => {
    const lista = clientesPorCobrar({ prestamos: [prestamo], clientes: [] }, '2026-12-24');
    expect(lista).toHaveLength(1);
    expect(lista[0].cuotas.map((c) => c.cuota.id)).toEqual(['r2']);
  });
});

describe('rédito + capital en un préstamo con cuotas', () => {
  // Cuota de 3,500 = 1,000 de rédito + 2,500 de capital
  const cuota = (pagado: number, mora = 0) =>
    ({
      id: 'q', prestamo_id: 'p', numero: 2, fecha_vencimiento: '2026-12-25', monto: 3500, monto_pagado: pagado,
      interes: 1000, capital: 2500, saldo_capital: 7500, mora_acumulada: mora, mora_pagada: 0, estado: 'parcial',
    }) as Cuota;

  it('el caso de la pantalla: 500 ya abonados, rédito + 500 a capital', () => {
    expect(repartoRedito(cuota(500), 500)).toEqual({
      yaAbonado: 500, faltaRedito: 500, mora: 0, capitalPagado: 500, capitalQueSeCorre: 2000, cobro: 1000, error: null,
    });
  });

  it('solo el rédito, sin abonos previos', () => {
    expect(repartoRedito(cuota(0), 0)).toMatchObject({ faltaRedito: 1000, capitalQueSeCorre: 2500, cobro: 1000 });
  });

  it('lo abonado de más del rédito ya cuenta como capital', () => {
    expect(repartoRedito(cuota(1500), 0)).toMatchObject({ faltaRedito: 0, capitalPagado: 500, capitalQueSeCorre: 2000, cobro: 0 });
  });

  it('cobra también la mora', () => {
    expect(repartoRedito(cuota(0, 300), 200)).toMatchObject({ cobro: 1500, mora: 300 });
  });

  it('si con el abono se paga todo el capital, es la cuota completa', () => {
    expect(repartoRedito(cuota(500), 2500).error).toMatch(/Cuota completa/);
    expect(repartoRedito(cuota(0), 2499.99).error).toBeNull();
  });
});
