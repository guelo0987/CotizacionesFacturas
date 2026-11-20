import type { AppState, Cliente, Cuota, Prestamo } from '../types';
import { moraPendiente } from './calculos';
import { moverDia } from './cuadre';
import { redondearDinero } from './validacion';

/**
 * Cobros pendientes: qué clientes tienen que pagar y cuándo.
 *
 * Es lo que alimenta la campanita. Mira las cuotas de los préstamos vivos
 * que siguen debiendo algo y las coloca según su vencimiento respecto a
 * «hoy» (el día de Santo Domingo, el mismo con el que el servidor marca los
 * atrasos y acumula la mora).
 */

export type Urgencia = 'atrasado' | 'hoy' | 'manana' | 'semana';

/** Filtros de la campanita. `ayer` es un recorte de los atrasados. */
export type FiltroCobros = 'todos' | 'atrasado' | 'ayer' | 'hoy' | 'manana' | 'semana';

/** Cuántos días hacia adelante mira la campanita. */
export const DIAS_ADELANTE = 7;

export interface CuotaPorCobrar {
  prestamo: Prestamo;
  cuota: Cuota;
  /** Días respecto a hoy: negativo = vencida hace tantos días, 0 = hoy. */
  dias: number;
  /** Lo que falta de la cuota (sin mora). */
  restante: number;
  mora: number;
  /** Lo que hay que cobrar por esta cuota: restante + mora. */
  total: number;
}

export interface ClientePorCobrar {
  clienteId: string;
  cliente: Cliente | null;
  cuotas: CuotaPorCobrar[];
  /** La cuota más urgente: la más vieja. */
  primera: CuotaPorCobrar;
  urgencia: Urgencia;
  /** Días de atraso de la cuota más vieja (0 si no hay atraso). */
  diasAtraso: number;
  /** Total a cobrar de las cuotas dentro de la ventana (con mora). */
  total: number;
  /** De ese total, cuánto está vencido (con mora). */
  vencido: number;
}

const DIA_MS = 86_400_000;
const aUTC = (dia: string) => {
  const [a, m, d] = dia.split('T')[0].split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};
const diasEntre = (desde: string, hasta: string) => Math.round((aUTC(hasta) - aUTC(desde)) / DIA_MS);

export function urgenciaDe(dias: number): Urgencia {
  if (dias < 0) return 'atrasado';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'manana';
  return 'semana';
}

/** Todas las cuotas que vencen hasta `hoy + DIAS_ADELANTE` y deben algo. */
export function cuotasPorCobrar(
  datos: Pick<AppState, 'prestamos'>,
  hoy: string,
  diasAdelante = DIAS_ADELANTE
): CuotaPorCobrar[] {
  const limite = moverDia(hoy, diasAdelante);
  const lista: CuotaPorCobrar[] = [];

  for (const prestamo of datos.prestamos) {
    if (prestamo.estado === 'saldado') continue;
    for (const cuota of prestamo.cuotas ?? []) {
      if (cuota.estado === 'pagada') continue;
      const vence = (cuota.fecha_vencimiento ?? '').split('T')[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(vence) || vence > limite) continue;

      const restante = redondearDinero(Math.max(0, (cuota.monto || 0) - (cuota.monto_pagado || 0)));
      const mora = moraPendiente(cuota);
      if (restante <= 0 && mora <= 0) continue;

      lista.push({
        prestamo,
        cuota,
        dias: diasEntre(hoy, vence),
        restante,
        mora,
        total: redondearDinero(restante + mora),
      });
    }
  }

  return lista.sort((a, b) => a.dias - b.dias || b.total - a.total);
}

/**
 * Los mismos cobros agrupados por cliente, del más urgente al menos: primero
 * quien lleva más días de atraso; a igual fecha, quien debe más.
 */
export function clientesPorCobrar(
  datos: Pick<AppState, 'prestamos' | 'clientes'>,
  hoy: string,
  diasAdelante = DIAS_ADELANTE
): ClientePorCobrar[] {
  const porCliente = new Map<string, CuotaPorCobrar[]>();
  for (const item of cuotasPorCobrar(datos, hoy, diasAdelante)) {
    const id = item.prestamo.cliente_id;
    const lista = porCliente.get(id) ?? [];
    lista.push(item);
    porCliente.set(id, lista);
  }

  const clientes = new Map(datos.clientes.map((c) => [c.id, c]));
  return [...porCliente.entries()]
    .map(([clienteId, cuotas]) => {
      const primera = cuotas[0];
      return {
        clienteId,
        cliente: clientes.get(clienteId) ?? null,
        cuotas,
        primera,
        urgencia: urgenciaDe(primera.dias),
        diasAtraso: Math.max(0, -primera.dias),
        total: redondearDinero(cuotas.reduce((s, c) => s + c.total, 0)),
        vencido: redondearDinero(cuotas.filter((c) => c.dias < 0).reduce((s, c) => s + c.total, 0)),
      };
    })
    .sort((a, b) => a.primera.dias - b.primera.dias || b.total - a.total);
}

/** ¿Entra esta cuota en el filtro elegido? */
export function cuotaEnFiltro(dias: number, filtro: FiltroCobros): boolean {
  switch (filtro) {
    case 'todos':
      return true;
    case 'atrasado':
      return dias < 0;
    case 'ayer':
      return dias === -1;
    case 'hoy':
      return dias === 0;
    case 'manana':
      return dias === 1;
    case 'semana':
      return dias >= 0;
  }
}

/** ¿Entra este cliente en el filtro elegido? */
export function pasaFiltro(cliente: ClientePorCobrar, filtro: FiltroCobros): boolean {
  return cliente.cuotas.some((c) => cuotaEnFiltro(c.dias, filtro));
}

/**
 * Los clientes de un filtro, con sólo las cuotas de ese filtro: en «Hoy»
 * el total es lo que vence hoy, no todo lo que debe en la semana.
 */
export function filtrarClientes(clientes: ClientePorCobrar[], filtro: FiltroCobros): ClientePorCobrar[] {
  if (filtro === 'todos') return clientes;
  return clientes
    .map((c) => {
      const cuotas = c.cuotas.filter((q) => cuotaEnFiltro(q.dias, filtro));
      if (cuotas.length === 0) return null;
      return {
        ...c,
        cuotas,
        primera: cuotas[0],
        total: redondearDinero(cuotas.reduce((s, q) => s + q.total, 0)),
        vencido: redondearDinero(cuotas.filter((q) => q.dias < 0).reduce((s, q) => s + q.total, 0)),
      };
    })
    .filter((c): c is ClientePorCobrar => c !== null);
}

/** Cuántos clientes hay que atender ya: atrasados o que vencen hoy. */
export function avisosUrgentes(clientes: ClientePorCobrar[]): number {
  return clientes.filter((c) => c.primera.dias <= 0).length;
}

/** «Hoy», «Mañana», «Vence en 3 días», «Venció ayer», «12 días de atraso». */
export function textoVencimiento(dias: number): string {
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  if (dias > 1) return `Vence en ${dias} días`;
  if (dias === -1) return 'Venció ayer';
  return `${-dias} días de atraso`;
}
