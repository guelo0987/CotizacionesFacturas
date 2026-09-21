import { describe, expect, it } from 'vitest';
import {
  calcularImporteLinea,
  calcularPrestamo,
  calcularSaldoFactura,
  calcularTotalesDocumento,
  frecuenciaSegura,
  generarCalendarioCuotas,
  modalidadSegura,
  tasaAnualEquivalente,
  calcularMoraCuota,
  diasDeMora,
  moraPendiente,
  simularMora,
  calcularSaldoParaSaldar,
} from './calculos';
import type { Cuota, Prestamo } from '../types';
import { redondearDinero } from './validacion';

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

describe('calcularPrestamo · interés fijo total', () => {
  it('calcula interés fijo sobre el capital', () => {
    const r = calcularPrestamo(10000, 10, 4, 'fijo_total');
    expect(r.interesTotal).toBe(1000);
    expect(r.totalAPagar).toBe(11000);
    expect(r.cuotaBase).toBe(2750);
  });

  it('el interés no depende del número de cuotas', () => {
    expect(calcularPrestamo(10000, 10, 4, 'fijo_total').interesTotal).toBe(
      calcularPrestamo(10000, 10, 60, 'fijo_total').interesTotal
    );
  });

  it('es la modalidad por defecto, para no alterar préstamos antiguos', () => {
    expect(calcularPrestamo(10000, 10, 4).interesTotal).toBe(1000);
  });

  it('admite tasa cero', () => {
    const r = calcularPrestamo(5000, 0, 5, 'fijo_total');
    expect(r.interesTotal).toBe(0);
    expect(r.totalAPagar).toBe(5000);
    expect(r.cuotaBase).toBe(1000);
  });

  it('fuerza al menos una cuota', () => {
    expect(calcularPrestamo(1000, 10, 0, 'fijo_total').numCuotas).toBe(1);
  });

  it('ignora valores negativos', () => {
    const r = calcularPrestamo(-500, -10, 3, 'fijo_total');
    expect(r.totalAPagar).toBe(0);
  });
});

describe('calcularPrestamo · interés por periodo', () => {
  it('cobra la tasa una vez por cuota', () => {
    // 10% quincenal sobre RD$10,000, 4 cuotas quincenales
    const r = calcularPrestamo(10000, 10, 4, 'por_periodo');
    expect(r.interesPorCuota).toBe(1000);
    expect(r.interesTotal).toBe(4000);
    expect(r.totalAPagar).toBe(14000);
    expect(r.cuotaBase).toBe(3500);
  });

  it('el interés crece con el plazo', () => {
    expect(calcularPrestamo(10000, 5, 12, 'por_periodo').interesTotal).toBe(6000);
    expect(calcularPrestamo(10000, 5, 6, 'por_periodo').interesTotal).toBe(3000);
  });

  it('una sola cuota equivale al interés fijo', () => {
    expect(calcularPrestamo(10000, 10, 1, 'por_periodo').interesTotal).toBe(
      calcularPrestamo(10000, 10, 1, 'fijo_total').interesTotal
    );
  });

  it('admite tasa cero', () => {
    const r = calcularPrestamo(5000, 0, 5, 'por_periodo');
    expect(r.interesTotal).toBe(0);
    expect(r.totalAPagar).toBe(5000);
  });

  it('mantiene la precisión con tasas decimales', () => {
    const r = calcularPrestamo(7500, 2.5, 6, 'por_periodo');
    expect(r.interesPorCuota).toBe(187.5);
    expect(r.interesTotal).toBe(1125);
    expect(r.totalAPagar).toBe(8625);
    expect(r.cuotaBase).toBe(1437.5);
  });

  it('reparte el interés único en partes iguales entre las cuotas', () => {
    // 10% de 10,000 = 1,000 repartido entre 4 cuotas
    expect(calcularPrestamo(10000, 10, 4, 'fijo_total').interesPorCuota).toBe(250);
  });
});

describe('calcularPrestamo · cuota fija amortizada', () => {
  // Caso de referencia: reproduce exactamente el sistema con el que el
  // cliente compara (RD$10,000 al 12% quincenal a 4 cuotas).
  const referencia = () => calcularPrestamo(10000, 12, 4, 'amortizado');

  it('calcula la cuota del sistema francés', () => {
    // cuota = 10000 × 0.12 / (1 − 1.12^−4) = 3,292.34
    expect(referencia().cuotaBase).toBe(3292.34);
  });

  it('cobra menos interés que el modelo por periodo', () => {
    expect(referencia().interesTotal).toBe(3169.38);
    expect(calcularPrestamo(10000, 12, 4, 'por_periodo').interesTotal).toBe(4800);
  });

  it('reproduce la tabla de amortización al centavo', () => {
    const cuotas = referencia().cuotas;
    expect(cuotas.map((c) => c.interes)).toEqual([1200, 948.92, 667.71, 352.75]);
    expect(cuotas.map((c) => c.capital)).toEqual([2092.34, 2343.42, 2624.63, 2939.61]);
    expect(cuotas.map((c) => c.saldo)).toEqual([7907.66, 5564.24, 2939.61, 0]);
  });

  it('el interés baja cuota a cuota', () => {
    const interes = referencia().cuotas.map((c) => c.interes);
    for (let i = 1; i < interes.length; i++) {
      expect(interes[i]).toBeLessThan(interes[i - 1]);
    }
  });

  it('liquida el capital exactamente, sin céntimos colgando', () => {
    const cuotas = referencia().cuotas;
    expect(cuotas[cuotas.length - 1].saldo).toBe(0);
    expect(redondearDinero(cuotas.reduce((a, c) => a + c.capital, 0))).toBe(10000);
  });

  it('la primera cuota carga el mismo interés que el modelo por periodo', () => {
    expect(referencia().cuotas[0].interes).toBe(
      calcularPrestamo(10000, 12, 4, 'por_periodo').cuotas[0].interes
    );
  });

  it('sin interés reparte el capital en partes iguales', () => {
    const r = calcularPrestamo(12000, 0, 4, 'amortizado');
    expect(r.interesTotal).toBe(0);
    expect(r.totalAPagar).toBe(12000);
    expect(r.cuotas.map((c) => c.monto)).toEqual([3000, 3000, 3000, 3000]);
  });

  it('con una sola cuota cobra capital más un periodo de interés', () => {
    const r = calcularPrestamo(10000, 12, 1, 'amortizado');
    expect(r.interesTotal).toBe(1200);
    expect(r.totalAPagar).toBe(11200);
  });

  it('aguanta un plazo largo sin dejar que el capital crezca', () => {
    const r = calcularPrestamo(10000, 12, 120, 'amortizado');
    expect(r.cuotas.every((c) => c.capital >= 0)).toBe(true);
    expect(r.cuotas[r.cuotas.length - 1].saldo).toBe(0);
  });
});

describe('desglose de cuotas · las tres modalidades', () => {
  it.each(['por_periodo', 'amortizado', 'fijo_total'] as const)(
    'en %s la suma de capital devuelve el préstamo y los montos cuadran',
    (modalidad) => {
      const r = calcularPrestamo(7350.55, 8.25, 7, modalidad);
      const capital = redondearDinero(r.cuotas.reduce((a, c) => a + c.capital, 0));
      const montos = redondearDinero(r.cuotas.reduce((a, c) => a + c.monto, 0));

      expect(capital).toBe(7350.55);
      expect(montos).toBe(r.totalAPagar);
      expect(r.cuotas[r.cuotas.length - 1].saldo).toBe(0);
      // Cada cuota es exactamente interés + capital
      for (const c of r.cuotas) {
        expect(redondearDinero(c.interes + c.capital)).toBe(c.monto);
      }
    }
  );
});

describe('tasaAnualEquivalente', () => {
  it.each([
    ['diario', 1, 365],
    ['semanal', 2, 104],
    ['quincenal', 10, 240],
    ['mensual', 5, 60],
    ['bimestral', 10, 60],
    ['trimestral', 12, 48],
    ['semestral', 20, 40],
    ['anual', 30, 30],
  ] as const)('convierte una tasa %s a su equivalente anual', (frecuencia, tasa, esperada) => {
    expect(tasaAnualEquivalente(tasa, frecuencia)).toBe(esperada);
  });
});

describe('frecuenciaSegura y modalidadSegura', () => {
  it('acepta los valores conocidos', () => {
    expect(frecuenciaSegura('trimestral')).toBe('trimestral');
    expect(modalidadSegura('por_periodo')).toBe('por_periodo');
  });

  it('cae en un valor sensato ante datos corruptos o antiguos', () => {
    expect(frecuenciaSegura('cada luna llena')).toBe('mensual');
    expect(frecuenciaSegura(null)).toBe('mensual');
    // Un préstamo sin modalidad viene de antes del cambio: interés único.
    expect(modalidadSegura(undefined)).toBe('fijo_total');
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
    ['diario', '2026-01-02'],
    ['semanal', '2026-01-08'],
    ['quincenal', '2026-01-16'],
    ['mensual', '2026-02-01'],
    ['bimestral', '2026-03-01'],
    ['trimestral', '2026-04-01'],
    ['semestral', '2026-07-01'],
    ['anual', '2027-01-01'],
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

  it('cobra el mismo día de cada mes, no cada 30 días', () => {
    const cal = generarCalendarioCuotas(3000, 3, 'mensual', '2026-01-15');
    expect(cal.map((c) => c.fechaVencimiento)).toEqual([
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
  });

  it('ajusta el día que no existe en el mes de destino', () => {
    // 31 de enero + 1 mes = 28 de febrero, y el 31 se recupera después.
    const cal = generarCalendarioCuotas(3000, 3, 'mensual', '2026-01-31');
    expect(cal.map((c) => c.fechaVencimiento)).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('cruza el cambio de año correctamente', () => {
    const cal = generarCalendarioCuotas(2000, 2, 'mensual', '2026-12-15');
    expect(cal[0].fechaVencimiento).toBe('2027-01-15');
    expect(cal[1].fechaVencimiento).toBe('2027-02-15');
  });

  it('cruza el cambio de año también con frecuencia quincenal', () => {
    const cal = generarCalendarioCuotas(2000, 2, 'quincenal', '2026-12-25');
    expect(cal[0].fechaVencimiento).toBe('2027-01-09');
    expect(cal[1].fechaVencimiento).toBe('2027-01-24');
  });

  it('respeta el año bisiesto', () => {
    const cal = generarCalendarioCuotas(1000, 1, 'mensual', '2028-01-31');
    expect(cal[0].fechaVencimiento).toBe('2028-02-29');
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

describe('mora por atraso', () => {
  // El caso que planteó el cliente: cuota semanal que vence el viernes, el
  // cobrador habilita la mora el sábado. Nunca cobra hacia atrás.
  const VIERNES = '2026-09-11';
  const SABADO = '2026-09-12';

  describe('diasDeMora', () => {
    it('no cobra el mismo día en que se habilita', () => {
      expect(diasDeMora(VIERNES, SABADO, SABADO)).toBe(0);
    });

    it('cobra un día al día siguiente de habilitarla', () => {
      expect(diasDeMora(VIERNES, SABADO, '2026-09-13')).toBe(1);
    });

    it('cuenta desde el vencimiento si la mora ya estaba activa', () => {
      expect(diasDeMora(VIERNES, '2026-09-01', SABADO)).toBe(1);
      expect(diasDeMora(VIERNES, '2026-09-01', '2026-09-18')).toBe(7);
    });

    it('no cobra nada antes del vencimiento', () => {
      expect(diasDeMora('2026-09-30', '2026-09-01', SABADO)).toBe(0);
    });

    it('sin fecha de habilitación cuenta desde el vencimiento', () => {
      expect(diasDeMora(VIERNES, null, '2026-09-14')).toBe(3);
    });

    it('retroactiva: alcanza los atrasos anteriores a habilitarla', () => {
      // Habilitada el sábado, pero cobrando desde que venció el viernes
      expect(diasDeMora(VIERNES, SABADO, SABADO, true)).toBe(1);
      expect(diasDeMora(VIERNES, '2026-09-20', '2026-09-21', true)).toBe(10);
    });
  });

  describe('calcularMoraCuota', () => {
    const prestamo = (extra: Partial<Prestamo> = {}): Prestamo =>
      ({
        id: 'p1', cliente_id: 'c1', monto_prestado: 10000, tasa_interes: 10,
        modalidad_interes: 'por_periodo', interes_total: 4000, total_a_pagar: 14000,
        num_cuotas: 4, frecuencia: 'semanal', fecha_inicio: '2026-09-04',
        mora_activa: true, mora_diaria: 100, mora_modo: 'por_cuota', mora_desde: SABADO,
        estado: 'atrasado', created_at: '', ...extra,
      }) as Prestamo;

    const cuota = (extra: Partial<Cuota> = {}): Cuota =>
      ({
        id: 'q1', prestamo_id: 'p1', numero: 1, fecha_vencimiento: VIERNES,
        monto: 1000, mora_acumulada: 0, mora_pagada: 0, interes: 0, capital: 1000,
        saldo_capital: 0, monto_pagado: 0, estado: 'atrasada', ...extra,
      }) as Cuota;

    it('cobra RD$100 por cada día de atraso', () => {
      expect(calcularMoraCuota(prestamo(), cuota(), '2026-09-15')).toEqual({
        dias: 3,
        monto: 300,
      });
    });

    it('no cobra nada con la mora deshabilitada', () => {
      const r = calcularMoraCuota(prestamo({ mora_activa: false }), cuota(), '2026-09-15');
      expect(r).toEqual({ dias: 0, monto: 0 });
    });

    it('congela la mora al saldar la cuota', () => {
      const saldada = cuota({ estado: 'pagada', monto_pagado: 1000, mora_acumulada: 200 });
      expect(calcularMoraCuota(prestamo(), saldada, '2026-09-30')).toEqual({
        dias: 0,
        monto: 200,
      });
    });

    it('respeta el monto diario que ponga el cobrador', () => {
      const r = calcularMoraCuota(prestamo({ mora_diaria: 250 }), cuota(), '2026-09-14');
      expect(r).toEqual({ dias: 2, monto: 500 });
    });
  });

  describe('moraPendiente', () => {
    const base = {
      id: 'q1', prestamo_id: 'p1', numero: 1, fecha_vencimiento: VIERNES, monto: 1000,
      interes: 0, capital: 1000, saldo_capital: 0, monto_pagado: 0, estado: 'atrasada',
    } as const;

    it('descuenta lo que ya se cobró de mora', () => {
      expect(moraPendiente({ ...base, mora_acumulada: 300, mora_pagada: 100 } as Cuota)).toBe(200);
    });

    it('nunca queda negativa', () => {
      expect(moraPendiente({ ...base, mora_acumulada: 100, mora_pagada: 300 } as Cuota)).toBe(0);
    });
  });
});

describe('simularMora', () => {
  const HOY = '2026-09-20';

  const cuota = (numero: number, vence: string, estado: Cuota['estado'] = 'atrasada'): Cuota =>
    ({
      id: `q${numero}`, prestamo_id: 'p1', numero, fecha_vencimiento: vence,
      monto: 1000, mora_acumulada: 0, mora_pagada: 0, interes: 0, capital: 1000,
      saldo_capital: 0, monto_pagado: 0, estado,
    }) as Cuota;

  const prestamo = (): Prestamo =>
    ({
      id: 'p1', cliente_id: 'c1', monto_prestado: 4000, tasa_interes: 0,
      modalidad_interes: 'fijo_total', interes_total: 0, total_a_pagar: 4000,
      num_cuotas: 4, frecuencia: 'semanal', fecha_inicio: '2026-08-30',
      mora_activa: false, mora_diaria: 0, mora_modo: 'por_cuota',
      mora_desde: null, mora_retroactiva: false, estado: 'atrasado', created_at: '',
      cuotas: [
        cuota(1, '2026-09-13'), // 7 días vencida
        cuota(2, '2026-09-18'), // 2 días vencida
        cuota(3, '2026-09-25', 'pendiente'),
      ],
    }) as Prestamo;

  it('desde hoy no cobra nada de entrada', () => {
    expect(simularMora(prestamo(), 100, 'por_cuota', false, HOY)).toEqual({
      total: 0,
      cuotas: 2,
    });
  });

  it('retroactiva cobra los días ya vencidos de cada cuota', () => {
    // 7 días × 100 + 2 días × 100 = 900
    expect(simularMora(prestamo(), 100, 'por_cuota', true, HOY)).toEqual({
      total: 900,
      cuotas: 2,
    });
  });

  it('retroactiva en modo por_prestamo sólo cobra la más antigua', () => {
    // sólo la cuota 1: 7 días × 100 = 700
    expect(simularMora(prestamo(), 100, 'por_prestamo', true, HOY)).toEqual({
      total: 700,
      cuotas: 1,
    });
  });

  it('ignora las cuotas ya pagadas y las que no han vencido', () => {
    const p = prestamo();
    p.cuotas![0].estado = 'pagada';
    expect(simularMora(p, 100, 'por_cuota', true, HOY)).toEqual({ total: 200, cuotas: 1 });
  });
});

describe('calcularSaldoParaSaldar', () => {
  const cuota = (numero: number, extra: Partial<Cuota> = {}): Cuota =>
    ({
      id: `q${numero}`, prestamo_id: 'p1', numero, fecha_vencimiento: '2026-09-01',
      monto: 3292.34, mora_acumulada: 0, mora_pagada: 0, interes: 0, capital: 0,
      saldo_capital: 0, monto_pagado: 0, estado: 'pendiente', ...extra,
    }) as Cuota;

  const prestamo = (cuotas: Cuota[]): Prestamo =>
    ({
      id: 'p1', cliente_id: 'c1', monto_prestado: 10000, tasa_interes: 12,
      modalidad_interes: 'amortizado', interes_total: 3169.38, total_a_pagar: 13169.38,
      num_cuotas: 4, frecuencia: 'quincenal', fecha_inicio: '2026-08-01',
      mora_activa: false, mora_diaria: 0, mora_modo: 'por_cuota', mora_desde: null,
      mora_retroactiva: false, estado: 'activo', created_at: '', cuotas,
    }) as Prestamo;

  it('cobra todas las cuotas que restan, con sus intereses', () => {
    // Pagó la primera: restan tres cuotas completas (la última absorbe el redondeo)
    const r = calcularSaldoParaSaldar(
      prestamo([
        cuota(1, { monto_pagado: 3292.34, estado: 'pagada' }),
        cuota(2),
        cuota(3),
        cuota(4, { monto: 3292.36 }),
      ])
    );
    expect(r.lineas.map((l) => l.numero)).toEqual([2, 3, 4]);
    expect(r.totalCuotas).toBe(9877.04);
    expect(r.total).toBe(9877.04);
  });

  it('descuenta lo que ya se abonó de una cuota a medias', () => {
    const r = calcularSaldoParaSaldar(prestamo([cuota(1, { monto: 1000, monto_pagado: 700 })]));
    expect(r.totalCuotas).toBe(300);
  });

  it('incluye la mora pendiente, o el préstamo no quedaría saldado', () => {
    const r = calcularSaldoParaSaldar(
      prestamo([
        cuota(1, { monto: 1000, mora_acumulada: 600, mora_pagada: 100 }),
        cuota(2, { monto: 1000 }),
      ])
    );
    expect(r.totalCuotas).toBe(2000);
    expect(r.totalMora).toBe(500);
    expect(r.total).toBe(2500);
  });

  it('una cuota pagada pero con mora pendiente sigue contando', () => {
    const r = calcularSaldoParaSaldar(
      prestamo([cuota(1, { monto: 1000, monto_pagado: 1000, estado: 'pagada', mora_acumulada: 300 })])
    );
    expect(r.lineas).toHaveLength(1);
    expect(r.total).toBe(300);
  });

  it('un préstamo saldado no debe nada', () => {
    const r = calcularSaldoParaSaldar(
      prestamo([cuota(1, { monto: 1000, monto_pagado: 1000, estado: 'pagada' })])
    );
    expect(r).toEqual({ lineas: [], totalCuotas: 0, totalMora: 0, total: 0 });
  });
});
