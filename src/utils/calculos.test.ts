import { describe, expect, it } from 'vitest';
import {
  calcularImporteLinea,
  calcularPrestamo,
  calcularSaldoFactura,
  calcularTotalesDocumento,
  generarCalendarioCuotas,
} from './calculos';

describe('calcularImporteLinea', () => {
  it('multiplica cantidad por precio', () => {
    expect(calcularImporteLinea(3, 250)).toBe(750);
  });

  it('redondea a dos decimales', () => {
    expect(calcularImporteLinea(3, 33.333)).toBe(100);
  });

  it('trata los valores ausentes como cero', () => {
    expect(calcularImporteLinea(0, 100)).toBe(0);
  });
});

describe('calcularTotalesDocumento', () => {
  it('suma las líneas y aplica el ITBIS', () => {
    const totales = calcularTotalesDocumento(
      [
        { cantidad: 2, precio_unitario: 1500 },
        { cantidad: 1, precio_unitario: 500 },
      ],
      true,
      18
    );
    expect(totales.subtotal).toBe(3500);
    expect(totales.itbis).toBe(630);
    expect(totales.total).toBe(4130);
  });

  it('omite el ITBIS cuando no aplica', () => {
    const totales = calcularTotalesDocumento([{ cantidad: 1, precio_unitario: 1000 }], false, 18);
    expect(totales.itbis).toBe(0);
    expect(totales.total).toBe(1000);
  });

  it('devuelve ceros sin líneas', () => {
    expect(calcularTotalesDocumento([], true, 18)).toEqual({
      subtotal: 0,
      itbis: 0,
      total: 0,
    });
  });

  it('no acumula error de coma flotante', () => {
    const totales = calcularTotalesDocumento(
      Array.from({ length: 10 }, () => ({ cantidad: 1, precio_unitario: 0.1 })),
      false,
      18
    );
    expect(totales.subtotal).toBe(1);
  });

  it('respeta una tasa de ITBIS distinta de la estándar', () => {
    const totales = calcularTotalesDocumento([{ cantidad: 1, precio_unitario: 1000 }], true, 16);
    expect(totales.itbis).toBe(160);
    expect(totales.total).toBe(1160);
  });
});

describe('calcularPrestamo', () => {
  it('calcula interés fijo sobre el capital', () => {
    const r = calcularPrestamo(10000, 10, 4);
    expect(r.interesTotal).toBe(1000);
    expect(r.totalAPagar).toBe(11000);
    expect(r.cuotaBase).toBe(2750);
  });

  it('el interés no depende del número de cuotas', () => {
    expect(calcularPrestamo(10000, 10, 4).interesTotal).toBe(
      calcularPrestamo(10000, 10, 60).interesTotal
    );
  });

  it('admite tasa cero', () => {
    const r = calcularPrestamo(5000, 0, 5);
    expect(r.interesTotal).toBe(0);
    expect(r.totalAPagar).toBe(5000);
    expect(r.cuotaBase).toBe(1000);
  });

  it('fuerza al menos una cuota', () => {
    expect(calcularPrestamo(1000, 10, 0).numCuotas).toBe(1);
  });

  it('ignora valores negativos', () => {
    const r = calcularPrestamo(-500, -10, 3);
    expect(r.totalAPagar).toBe(0);
  });
});

describe('generarCalendarioCuotas', () => {
  it('genera tantas cuotas como se piden', () => {
    const cal = generarCalendarioCuotas(11000, 4, 'quincenal', '2026-01-01');
    expect(cal).toHaveLength(4);
    expect(cal.map((c) => c.numero)).toEqual([1, 2, 3, 4]);
  });

  it('la suma de las cuotas cuadra exactamente con el total', () => {
    const total = 10000;
    const cal = generarCalendarioCuotas(total, 3, 'mensual', '2026-01-01');
    const suma = cal.reduce((a, c) => a + c.monto, 0);
    expect(Math.round(suma * 100) / 100).toBe(total);
  });

  it('la última cuota absorbe el redondeo', () => {
    const cal = generarCalendarioCuotas(10000, 3, 'mensual', '2026-01-01');
    expect(cal[0].monto).toBe(3333.33);
    expect(cal[1].monto).toBe(3333.33);
    expect(cal[2].monto).toBe(3333.34);
  });

  it.each([
    ['semanal', '2026-01-08'],
    ['quincenal', '2026-01-16'],
    ['mensual', '2026-01-31'],
  ] as const)('espacia las fechas según la frecuencia %s', (frecuencia, esperada) => {
    const cal = generarCalendarioCuotas(1000, 2, frecuencia, '2026-01-01');
    expect(cal[0].fechaVencimiento).toBe(esperada);
  });

  it('las fechas avanzan de forma estricta', () => {
    const cal = generarCalendarioCuotas(12000, 12, 'mensual', '2026-01-01');
    for (let i = 1; i < cal.length; i++) {
      expect(cal[i].fechaVencimiento > cal[i - 1].fechaVencimiento).toBe(true);
    }
  });

  it('cruza el cambio de año correctamente', () => {
    const cal = generarCalendarioCuotas(2000, 2, 'mensual', '2026-12-15');
    expect(cal[0].fechaVencimiento).toBe('2027-01-14');
    expect(cal[1].fechaVencimiento).toBe('2027-02-13');
  });
});

describe('calcularSaldoFactura', () => {
  it('marca la factura como pagada al saldar', () => {
    const r = calcularSaldoFactura(1000, 0, 1000);
    expect(r.montoPagado).toBe(1000);
    expect(r.saldoPendiente).toBe(0);
    expect(r.estado).toBe('pagada');
  });

  it('marca parcial cuando queda saldo', () => {
    const r = calcularSaldoFactura(1000, 0, 400);
    expect(r.saldoPendiente).toBe(600);
    expect(r.estado).toBe('parcial');
  });

  it('acumula sobre pagos anteriores', () => {
    const r = calcularSaldoFactura(1000, 400, 300);
    expect(r.montoPagado).toBe(700);
    expect(r.saldoPendiente).toBe(300);
  });

  it('nunca deja un saldo negativo', () => {
    const r = calcularSaldoFactura(1000, 0, 1500);
    expect(r.saldoPendiente).toBe(0);
  });

  it('mantiene la precisión con decimales', () => {
    const r = calcularSaldoFactura(4130, 1376.67, 1376.67);
    expect(r.montoPagado).toBe(2753.34);
    expect(r.saldoPendiente).toBe(1376.66);
  });
});
