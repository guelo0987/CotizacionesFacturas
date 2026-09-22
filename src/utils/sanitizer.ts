/**
 * Formateo para presentación (moneda, fechas).
 *
 * La validación y el saneamiento de entrada viven en `./validacion`.
 * Aquí se reexportan los formateadores que usan los componentes para no
 * tener que tocar todos los imports.
 */

export {
  limpiarTexto,
  limpiarTextoMultilinea,
  formatearDocumento as formatDocumento,
  formatearTelefono as formatTelefono,
  redondearDinero as roundMoney,
} from './validacion';

import { redondearDinero } from './validacion';

/** Formatea en pesos dominicanos: RD$ 1,250.00 */
export function formatCurrency(amount: number | string | undefined | null): string {
  const num = Number(amount);
  const seguro = Number.isFinite(num) ? num : 0;

  const formateado = new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(seguro);

  // Según el motor, `Intl` devuelve "DOP 1,250.00" o ya "RD$ 1,250.00".
  // Se normaliza a RD$ en ambos casos en vez de depender de un `replace`
  // que en algunos navegadores no encontraba nada.
  return formateado.replace(/DOP\s?/, 'RD$ ').replace(/\s+/g, ' ').trim();
}

/**
 * Día (AAAA-MM-DD) de una fecha tal como se vivió en la zona del usuario.
 *
 * Las columnas de sólo fecha llegan como «2026-09-21» y se respetan tal
 * cual. Las de fecha y hora —el momento de un pago— llegan en UTC:
 * «2026-09-22T01:30:00+00:00» es todavía el 21, a las 9:30 p. m., en Santo
 * Domingo. Quedarse con lo que va antes de la «T» daría el día siguiente.
 */
export function diaLocal(valor: string, zonaHoraria?: string): string {
  const texto = String(valor ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(texto)) return texto.split('T')[0];

  // Lo que puede devolver Postgres: espacio en vez de «T», microsegundos y
  // la zona abreviada «+00», que no todos los navegadores interpretan.
  const iso = texto
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})$/, '$1:00');
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return texto.slice(0, 10);

  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(momento);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

/** Hoy (AAAA-MM-DD) en hora local: pasadas las 8 p. m. en RD, UTC ya va por mañana. */
export function hoyLocal(): string {
  return diaLocal(new Date().toISOString());
}

/** Fecha dominicana (22/07/2026) del día en que ocurrió, en hora local. */
export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '';
  try {
    if (typeof dateString === 'string' && dateString.includes('-')) {
      const parts = diaLocal(dateString).split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
    }
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return dateString;
  }
}

/**
 * Suma meses de calendario a una fecha ISO (YYYY-MM-DD), en UTC.
 *
 * El día se ajusta al último del mes cuando no existe: el 31 de enero más
 * un mes es el 28 de febrero, no el 3 de marzo. Es la misma regla que
 * aplica PostgreSQL al sumar un `interval '1 month'`, que es quien genera
 * el calendario definitivo.
 */
export function addMonthsToDate(dateString: string, months: number): string {
  const partesFecha = dateString ? dateString.split('T')[0].split('-') : [];
  // Sin fecha se parte de hoy, en hora local como el resto de la aplicación
  const partes = partesFecha.length === 3 ? partesFecha : hoyLocal().split('-');

  const anio = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);

  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) {
    return dateString;
  }

  const primeroDelMes = new Date(Date.UTC(anio, mes - 1 + months, 1));
  const ultimoDia = new Date(
    Date.UTC(primeroDelMes.getUTCFullYear(), primeroDelMes.getUTCMonth() + 1, 0)
  ).getUTCDate();

  primeroDelMes.setUTCDate(Math.min(dia, ultimoDia));
  return primeroDelMes.toISOString().split('T')[0];
}

/** Suma días a una fecha ISO (YYYY-MM-DD) trabajando siempre en UTC. */
export function addDaysToDate(dateString: string, days: number): string {
  const partesFecha = dateString ? dateString.split('-') : [];
  // Sin fecha se parte de hoy, en hora local como el resto de la aplicación
  const parts = partesFecha.length === 3 ? partesFecha : hoyLocal().split('-');
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

/** `true` si la fecha ya pasó, comparando sólo el día (no la hora). */
export function estaVencida(fecha: string | null | undefined): boolean {
  if (!fecha) return false;
  const partes = fecha.split('T')[0].split('-');
  if (partes.length !== 3) return false;

  const vencimiento = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2])));
  const hoy = new Date();
  const hoyUTC = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  return vencimiento.getTime() < hoyUTC.getTime();
}

export { redondearDinero };
