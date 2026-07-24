import type { BusinessSettings, AppState } from '../types';

const STORAGE_KEY = 'cotizaciones_facturas_prestamos_prod_v3';

const DEFAULT_SETTINGS: BusinessSettings = {
  business_name: 'Mi Negocio',
  phone: '',
  email: '',
  address: '',
  documento: '',
  logo_url: '',
  itbis_rate: 18,
  currency: 'RD$',
  supabase_url: import.meta.env.VITE_SUPABASE_URL || 'https://hxeovachlapvfubcebha.supabase.co',
  supabase_anon_key: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
};

export function getInitialState(): AppState {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        clientes: parsed.clientes || [],
        servicios: parsed.servicios || [],
        cotizaciones: parsed.cotizaciones || [],
        facturas: parsed.facturas || [],
        prestamos: parsed.prestamos || [],
        pagos: parsed.pagos || [],
      };
    } catch (e) {
      console.error('Failed to parse saved app state', e);
    }
  }

  return {
    settings: DEFAULT_SETTINGS,
    clientes: [],
    servicios: [],
    cotizaciones: [],
    facturas: [],
    prestamos: [],
    pagos: [],
  };
}

export function saveStateToStorage(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Error saving state to localStorage', e);
  }
}

export function clearStateFromStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Error clearing localStorage', e);
  }
}
