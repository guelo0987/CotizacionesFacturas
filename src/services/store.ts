import type { Servicio, BusinessSettings, AppState } from '../types';

const STORAGE_KEY = 'cotizaciones_facturas_prestamos_prod_v2';

const DEFAULT_SETTINGS: BusinessSettings = {
  business_name: 'Mi Negocio de Servicios',
  phone: '',
  email: 'yeisito@gmail.com',
  address: '',
  documento: '',
  logo_url: '',
  itbis_rate: 18,
  currency: 'RD$',
  supabase_url: 'https://hxeovachlapvfubcebha.supabase.co',
  supabase_anon_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4ZW92YWNobGFwdmZ1YmNlYmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODM0NDcsImV4cCI6MjEwMDQ1OTQ0N30.c-CmCmKcqmTksouDUtPeUg2VbLOvRITydY1WwNy81cA',
};

const DEFAULT_SERVICIOS: Servicio[] = [
  {
    id: 'serv-1',
    nombre: 'Servicio Básico de Plomería / Fontanería',
    categoria: 'plomería',
    descripcion: 'Instalación o reparación técnica básica.',
    precio_base: 2000,
    unidad: 'servicio',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'serv-2',
    nombre: 'Servicio Básico Eléctrico / Breaker',
    categoria: 'electricidad',
    descripcion: 'Instalación de luminaria, tomacorriente o breaker.',
    precio_base: 1500,
    unidad: 'unidad',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'serv-3',
    nombre: 'Pintura y Mano de Obra (M²)',
    categoria: 'pintura',
    descripcion: 'Aplicación de pintura en paredes o techos.',
    precio_base: 250,
    unidad: 'm²',
    activo: true,
    created_at: new Date().toISOString(),
  },
];

export function getInitialState(): AppState {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        clientes: parsed.clientes || [],
        servicios: parsed.servicios || DEFAULT_SERVICIOS,
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
    servicios: DEFAULT_SERVICIOS,
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
