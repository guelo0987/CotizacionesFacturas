import { describe, expect, it } from 'vitest';
import {
  avisosUrgentes,
  clientesPorCobrar,
  cuotasPorCobrar,
  filtrarClientes,
  pasaFiltro,
  textoVencimiento,
  urgenciaDe,
} from './cobros';
import type { Cliente, Cuota, Prestamo } from '../types';

const HOY = '2026-11-20';

const cuota = (id: string, numero: number, vence: string, extra: Partial<Cuota> = {}) =>
  ({
    id, prestamo_id: 'x', numero, fecha_vencimiento: vence, monto: 1000, monto_pagado: 0,
    mora_acumulada: 0, mora_pagada: 0, estado: 'pendiente', ...extra,
  }) as Cuota;

const prestamo = (id: string, clienteId: string, cuotas: Cuota[], estado: Prestamo['estado'] = 'activo') =>
  ({ id, cliente_id: clienteId, estado, num_cuotas: cuotas.length, cuotas }) as unknown as Prestamo;

const cliente = (id: string, nombre: string) => ({ id, nombre, telefono: '8095550000' }) as Cliente;

const datos = {
  clientes: [cliente('ana', 'Ana'), cliente('beto', 'Beto'), cliente('caro', 'Caro'), cliente('dani', 'Dani')],
  prestamos: [
    // Ana: una cuota vencida hace 5 días con mora y otra que vence hoy
    prestamo('p-ana', 'ana', [
      cuota('a1', 1, '2026-11-15', { estado: 'atrasada', mora_acumulada: 250, mora_pagada: 50 }),
      cuota('a2', 2, HOY),
      cuota('a3', 3, '2026-12-20'),
    ]),
    // Beto: venció ayer, con un abono parcial
    prestamo('p-beto', 'beto', [cuota('b1', 1, '2026-11-19', { estado: 'atrasada', monto_pagado: 400 })]),
    // Caro: vence mañana y otra en 4 días
    prestamo('p-caro', 'caro', [cuota('c1', 1, '2026-11-21'), cuota('c2', 2, '2026-11-24')]),
    // Dani: todo pagado, y un préstamo saldado con una cuota vieja que no cuenta
    prestamo('p-dani', 'dani', [cuota('d1', 1, '2026-11-10', { estado: 'pagada', monto_pagado: 1000 })]),
    prestamo('p-dani2', 'dani', [cuota('d2', 1, '2026-11-01', { estado: 'atrasada' })], 'saldado'),
  ],
};

describe('cuotasPorCobrar', () => {
  it('sólo toma cuotas que deben algo, de préstamos vivos, dentro de la semana', () => {
    const ids = cuotasPorCobrar(datos, HOY).map((c) => c.cuota.id);
    expect(ids).toEqual(['a1', 'b1', 'a2', 'c1', 'c2']);
  });

  it('calcula los días, lo que resta y la mora pendiente', () => {
    const [a1, b1] = cuotasPorCobrar(datos, HOY);
    expect(a1).toMatchObject({ dias: -5, restante: 1000, mora: 200, total: 1200 });
    expect(b1).toMatchObject({ dias: -1, restante: 600, mora: 0, total: 600 });
  });

  it('una cuota con el monto pagado pero mora pendiente sigue por cobrar', () => {
    const conMora = {
      prestamos: [prestamo('p', 'ana', [cuota('m', 1, '2026-11-01', { monto_pagado: 1000, mora_acumulada: 90, estado: 'parcial' })])],
    };
    expect(cuotasPorCobrar(conMora, HOY)[0]).toMatchObject({ restante: 0, mora: 90, total: 90 });
  });

  it('la ventana hacia adelante se puede ajustar', () => {
    expect(cuotasPorCobrar(datos, HOY, 1).map((c) => c.cuota.id)).toEqual(['a1', 'b1', 'a2', 'c1']);
  });

  it('cruza bien el cambio de mes', () => {
    const fin = { prestamos: [prestamo('p', 'ana', [cuota('z', 1, '2026-12-01')])] };
    expect(cuotasPorCobrar(fin, '2026-11-30')[0].dias).toBe(1);
  });
});

describe('clientesPorCobrar', () => {
  const lista = clientesPorCobrar(datos, HOY);

  it('agrupa por cliente y ordena del más atrasado al menos urgente', () => {
    expect(lista.map((c) => c.cliente?.nombre)).toEqual(['Ana', 'Beto', 'Caro']);
  });

  it('suma lo que debe cada cliente y separa lo vencido', () => {
    const ana = lista[0];
    expect(ana).toMatchObject({ urgencia: 'atrasado', diasAtraso: 5, total: 2200, vencido: 1200 });
    expect(ana.cuotas).toHaveLength(2);
    expect(lista[2]).toMatchObject({ urgencia: 'manana', diasAtraso: 0, total: 2000, vencido: 0 });
  });

  it('a igual fecha va primero quien debe más', () => {
    const empate = {
      clientes: [cliente('x', 'X'), cliente('y', 'Y')],
      prestamos: [
        prestamo('px', 'x', [cuota('x1', 1, HOY, { monto: 500 })]),
        prestamo('py', 'y', [cuota('y1', 1, HOY, { monto: 900 })]),
      ],
    };
    expect(clientesPorCobrar(empate, HOY).map((c) => c.clienteId)).toEqual(['y', 'x']);
  });

  it('cuenta como urgentes a los atrasados y a los que vencen hoy', () => {
    expect(avisosUrgentes(lista)).toBe(2);
  });
});

describe('filtros', () => {
  const lista = clientesPorCobrar(datos, HOY);
  const nombres = (filtro: Parameters<typeof pasaFiltro>[1]) =>
    lista.filter((c) => pasaFiltro(c, filtro)).map((c) => c.cliente?.nombre);

  it('separa atrasados, ayer, hoy, mañana y la semana', () => {
    expect(nombres('todos')).toEqual(['Ana', 'Beto', 'Caro']);
    expect(nombres('atrasado')).toEqual(['Ana', 'Beto']);
    expect(nombres('ayer')).toEqual(['Beto']);
    expect(nombres('hoy')).toEqual(['Ana']);
    expect(nombres('manana')).toEqual(['Caro']);
    expect(nombres('semana')).toEqual(['Ana', 'Caro']);
  });
});

describe('filtrarClientes', () => {
  const lista = clientesPorCobrar(datos, HOY);

  it('en cada filtro sólo suma las cuotas de ese filtro', () => {
    const atrasados = filtrarClientes(lista, 'atrasado');
    expect(atrasados.map((c) => [c.cliente?.nombre, c.total])).toEqual([['Ana', 1200], ['Beto', 600]]);
    const hoy = filtrarClientes(lista, 'hoy');
    expect(hoy.map((c) => [c.cliente?.nombre, c.total, c.primera.cuota.id])).toEqual([['Ana', 1000, 'a2']]);
    const semana = filtrarClientes(lista, 'semana');
    expect(semana.map((c) => [c.cliente?.nombre, c.total])).toEqual([['Ana', 1000], ['Caro', 2000]]);
  });

  it('«Todos» deja a cada cliente con todo lo que debe', () => {
    expect(filtrarClientes(lista, 'todos')).toBe(lista);
  });
});

describe('textos', () => {
  it('describe el vencimiento en palabras', () => {
    expect(textoVencimiento(0)).toBe('Vence hoy');
    expect(textoVencimiento(1)).toBe('Vence mañana');
    expect(textoVencimiento(4)).toBe('Vence en 4 días');
    expect(textoVencimiento(-1)).toBe('Venció ayer');
    expect(textoVencimiento(-12)).toBe('12 días de atraso');
  });

  it('clasifica la urgencia', () => {
    expect([-3, 0, 1, 5].map(urgenciaDe)).toEqual(['atrasado', 'hoy', 'manana', 'semana']);
  });
});
