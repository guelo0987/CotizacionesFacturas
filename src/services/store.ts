import type { BusinessSettings, AppState } from '../types';

/**
 * `localStorage` es sólo una caché de lectura para que la aplicación pinte
 * algo mientras llegan los datos del servidor. La fuente de verdad es
 * siempre Supabase.
 *
 * La caché va separada por usuario: antes, iniciar sesión con otra cuenta en
 * el mismo navegador mezclaba los datos del usuario anterior con los nuevos.
 */
const PREFIJO_CACHE = 'jsoncotable:cache:';

export const DEFAULT_SETTINGS: BusinessSettings = {
  business_name: 'Mi Negocio',
  phone: '',
  email: '',
  address: '',
  documento: '',
  logo_url: '',
  qr_url: '',
  itbis_rate: 18,
  currency: 'RD$',
};

export const ESTADO_VACIO: AppState = {
  settings: DEFAULT_SETTINGS,
  clientes: [],
  servicios: [],
  cotizaciones: [],
  facturas: [],
  prestamos: [],
  pagos: [],
};

function claveDe(userId: string): string {
  return `${PREFIJO_CACHE}${userId}`;
}

export function getInitialState(): AppState {
  return ESTADO_VACIO;
}

export function leerCache(userId: string): AppState | null {
  try {
    const guardado = localStorage.getItem(claveDe(userId));
    if (!guardado) return null;

    const parsed = JSON.parse(guardado);
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      clientes: parsed.clientes ?? [],
      servicios: parsed.servicios ?? [],
      cotizaciones: parsed.cotizaciones ?? [],
      facturas: parsed.facturas ?? [],
      prestamos: parsed.prestamos ?? [],
      pagos: parsed.pagos ?? [],
    };
  } catch {
    // Una caché corrupta no debe impedir usar la aplicación
    return null;
  }
}

/**
 * Devuelve `false` si no se pudo guardar (típicamente por cuota agotada).
 * Antes esto fallaba en silencio y la aplicación dejaba de persistir sin
 * que nadie se enterara.
 */
export function guardarCache(userId: string, state: AppState): boolean {
  try {
    localStorage.setItem(claveDe(userId), JSON.stringify(state));
    return true;
  } catch {
    try {
      localStorage.removeItem(claveDe(userId));
    } catch {
      /* nada más que hacer */
    }
    return false;
  }
}

export function limpiarCache(userId?: string) {
  try {
    if (userId) {
      localStorage.removeItem(claveDe(userId));
      return;
    }
    // Sin usuario concreto: purgar toda la caché de la aplicación
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIJO_CACHE))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* almacenamiento no disponible */
  }
}
