import { describe, expect, it } from 'vitest';
import { traerTodo } from './supabaseDataService';

type Fila = { id: string };
const filas = (n: number): Fila[] => Array.from({ length: n }, (_, i) => ({ id: `f${String(i).padStart(5, '0')}` }));

/** Un servidor falso que entrega como máximo `tope` filas por petición. */
function servidor(datos: Fila[], tope: number, conConteo = true) {
  const pedidas: [number, number][] = [];
  const pedir = (desde: number, hasta: number) => {
    pedidas.push([desde, hasta]);
    const fin = Math.min(hasta + 1, desde + tope);
    return Promise.resolve({ data: datos.slice(desde, fin), error: null, count: conConteo ? datos.length : null });
  };
  return { pedir, pedidas };
}

describe('traerTodo', () => {
  it('trae más de 1,000 filas por tandas', async () => {
    const s = servidor(filas(2500), 1000);
    const todas = await traerTodo(s.pedir, 'cargar');
    expect(todas).toHaveLength(2500);
    expect(s.pedidas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('no se queda corto si el servidor permite menos de 1,000 por petición', async () => {
    const s = servidor(filas(1250), 300);
    expect(await traerTodo(s.pedir, 'cargar')).toHaveLength(1250);
  });

  it('sin conteo, para cuando una tanda llega incompleta', async () => {
    const s = servidor(filas(1500), 1000, false);
    expect(await traerTodo(s.pedir, 'cargar')).toHaveLength(1500);
  });

  it('una tabla vacía o pequeña se lee de una vez', async () => {
    expect(await traerTodo(servidor([], 1000).pedir, 'cargar')).toEqual([]);
    const s = servidor(filas(15), 1000);
    expect(await traerTodo(s.pedir, 'cargar')).toHaveLength(15);
    expect(s.pedidas).toHaveLength(1);
  });

  it('si entra una fila nueva a mitad de la lectura, no la duplica', async () => {
    const datos = filas(1500);
    let primera = true;
    const pedir = (desde: number, hasta: number) => {
      // Tras la primera tanda alguien guarda: todo se corre una posición
      if (!primera) datos.unshift({ id: 'nueva' });
      primera = false;
      return Promise.resolve({ data: datos.slice(desde, hasta + 1), error: null, count: datos.length });
    };
    const todas = await traerTodo(pedir, 'cargar');
    expect(new Set(todas.map((f) => f.id)).size).toBe(todas.length);
    expect(todas.length).toBeGreaterThanOrEqual(1500);
  });

  it('un error del servidor se informa, no se devuelve una lista a medias', async () => {
    const pedir = () =>
      Promise.resolve({ data: null, error: { code: 'XX000', message: 'fallo', details: '', hint: '' } as never, count: null });
    await expect(traerTodo(pedir, 'cargar los pagos')).rejects.toThrow(/No se pudo cargar los pagos/);
  });
});
