import { describe, expect, it } from 'vitest';
import {
  aCuotaDePago,
  aplicadoDePago,
  creditoSugerido,
  libroCliente,
  referenciaMovimiento,
  repartirCobro,
  saldoCliente,
  saldoClienteHasta,
  saldosPorCliente,
} from './creditos';
import type { MovimientoCredito, TipoMovimientoCredito } from '../types';

const mov = (
  id: string,
  cliente: string,
  tipo: TipoMovimientoCredito,
  monto: number,
  fecha: string
): MovimientoCredito => ({
  id, organizacion_id: 'o1', cliente_id: cliente, tipo, monto, pago_id: null, prestamo_id: null,
  factura_id: null, cuota_id: null, documento: null, metodo: null, referencia: null, nota: null,
  fecha, creado_por: null,
});

// El caso de la explicación: sobra 400 en una cuota, se usan la semana
// siguiente, luego un anticipo y una devolución.
const libro = [
  mov('a', 'c1', 'excedente', 400, '2026-10-02T15:00:00+00:00'),
  mov('b', 'c1', 'uso', -400, '2026-10-09T15:00:00+00:00'),
  mov('c', 'c1', 'anticipo', 1500, '2026-10-10T15:00:00+00:00'),
  mov('d', 'c2', 'excedente', 82, '2026-10-10T16:00:00+00:00'),
  mov('e', 'c1', 'devolucion', -100, '2026-10-11T15:00:00+00:00'),
];

describe('saldo a favor', () => {
  it('suma el libro de cada cliente', () => {
    expect(saldoCliente(libro, 'c1')).toBe(1400);
    expect(saldoCliente(libro, 'c2')).toBe(82);
    expect(saldoCliente(libro, 'nadie')).toBe(0);
  });

  it('lista sólo a los clientes con saldo', () => {
    const conCero = [...libro, mov('f', 'c3', 'anticipo', 50, '2026-10-12T15:00:00+00:00'),
      mov('g', 'c3', 'devolucion', -50, '2026-10-12T16:00:00+00:00')];
    const saldos = saldosPorCliente(conCero);
    expect(saldos.get('c1')).toBe(1400);
    expect(saldos.get('c2')).toBe(82);
    expect(saldos.has('c3')).toBe(false);
  });

  it('lleva el saldo acumulado en orden de fecha', () => {
    const desordenado = [libro[2], libro[0], libro[4], libro[1]];
    expect(libroCliente(desordenado, 'c1').map((r) => [r.id, r.saldo])).toEqual([
      ['a', 400], ['b', 0], ['c', 1500], ['e', 1400],
    ]);
  });

  it('da el saldo de un momento pasado, para reimprimir un recibo', () => {
    expect(saldoClienteHasta(libro, 'c1', '2026-10-02T15:00:00+00:00')).toBe(400);
    expect(saldoClienteHasta(libro, 'c1', '2026-10-09T15:00:00+00:00')).toBe(0);
    expect(saldoClienteHasta(libro, 'c1', '2026-10-30T00:00:00+00:00')).toBe(1400);
  });

  it('evita los céntimos sueltos al sumar', () => {
    const centavos = [0.1, 0.2, 0.7].map((m, i) => mov(String(i), 'c1', 'anticipo', m, '2026-10-01T00:00:00Z'));
    expect(saldoCliente(centavos, 'c1')).toBe(1);
  });
});

describe('lo que aplica cada pago', () => {
  it('un pago normal aplica su monto', () => {
    const pago = { monto: 600, credito_usado: 0, excedente: 0, monto_mora: 100 };
    expect(aplicadoDePago(pago)).toBe(600);
    expect(aCuotaDePago(pago)).toBe(500);
  });

  it('el excedente no cuenta como abono a la deuda', () => {
    expect(aplicadoDePago({ monto: 1000, credito_usado: 0, excedente: 400 })).toBe(600);
  });

  it('el saldo usado sí cuenta, aunque no traiga efectivo', () => {
    const pago = { monto: 200, credito_usado: 400, excedente: 0, monto_mora: 0 };
    expect(aplicadoDePago(pago)).toBe(600);
    expect(aCuotaDePago(pago)).toBe(600);
    expect(aplicadoDePago({ monto: 0, credito_usado: 1180, excedente: 0 })).toBe(1180);
  });

  it('los pagos de antes, sin los campos nuevos, siguen igual', () => {
    const antiguo = { monto: 4354.71, monto_mora: 1200 } as Parameters<typeof aCuotaDePago>[0];
    expect(aCuotaDePago(antiguo)).toBe(3154.71);
  });
});

describe('reparto de un cobro', () => {
  it('lo que pasa de la deuda queda a favor', () => {
    const r = repartirCobro({ efectivo: 1000, credito: 0, deuda: 600, saldoDisponible: 0 });
    expect(r).toMatchObject({ aplicado: 600, excedente: 400, entregado: 1000, error: null });
  });

  it('efectivo más saldo cubren la deuda', () => {
    const r = repartirCobro({ efectivo: 200, credito: 400, deuda: 600, saldoDisponible: 400 });
    expect(r).toMatchObject({ aplicado: 600, excedente: 0, entregado: 600, error: null });
  });

  it('un abono parcial no deja excedente', () => {
    const r = repartirCobro({ efectivo: 250, credito: 0, deuda: 600, saldoDisponible: 0 });
    expect(r).toMatchObject({ aplicado: 250, excedente: 0, error: null });
  });

  it('no usa más saldo del que hay', () => {
    expect(repartirCobro({ efectivo: 0, credito: 500, deuda: 600, saldoDisponible: 400 }).error)
      .toBe('El cliente sólo tiene RD$400.00 de saldo a favor.');
  });

  it('no mezcla saldo con sobrante', () => {
    expect(repartirCobro({ efectivo: 500, credito: 400, deuda: 600, saldoDisponible: 400 }).error)
      .toBe('Si usas saldo a favor no puede sobrar dinero: cobra sólo lo que falta para cubrir la deuda.');
  });

  it('el saldo no puede pasar de lo que se paga', () => {
    expect(repartirCobro({ efectivo: -100, credito: 400, deuda: 600, saldoDisponible: 400 }).error)
      .toBe('El saldo a favor usado no puede pasar de lo que se paga.');
  });

  it('exige que se pague algo', () => {
    expect(repartirCobro({ efectivo: 0, credito: 0, deuda: 600, saldoDisponible: 0 }).error)
      .toBe('El monto debe ser mayor que cero.');
  });

  it('sugiere el saldo justo para cubrir lo que falta', () => {
    expect(creditoSugerido(1400, 600)).toBe(600);
    expect(creditoSugerido(400, 600)).toBe(400);
    expect(creditoSugerido(0, 600)).toBe(0);
  });
});

describe('referencias', () => {
  it('distingue anticipos y devoluciones', () => {
    expect(referenciaMovimiento({ id: 'abcdef12-3456', tipo: 'anticipo' })).toBe('ANT-ABCDEF12');
    expect(referenciaMovimiento({ id: 'abcdef12-3456', tipo: 'devolucion' })).toBe('DEV-ABCDEF12');
  });
});
