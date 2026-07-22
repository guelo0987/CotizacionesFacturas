import type {
  Cliente,
  Servicio,
  Cotizacion,
  Factura,
  Prestamo,
  Cuota,
  BusinessSettings,
  AppState,
} from '../types';
import { roundMoney, addDaysToDate } from '../utils/sanitizer';

const STORAGE_KEY = 'cotizaciones_facturas_prestamos_app_data_v1';

const DEFAULT_SETTINGS: BusinessSettings = {
  business_name: 'Servicios de Plomería y Electricidad García',
  phone: '(809) 555-0199',
  email: 'garcia.servicios@gmail.com',
  address: 'Av. 27 de Febrero #145, Santo Domingo, R.D.',
  documento: '1-30-89765-4',
  logo_url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=150&q=80',
  itbis_rate: 18,
  currency: 'RD$',
  supabase_url: '',
  supabase_anon_key: '',
};

const DEFAULT_SERVICIOS: Servicio[] = [
  {
    id: 'serv-1',
    nombre: 'Instalación de Fregadero / Lavamanos',
    categoria: 'plomería',
    descripcion: 'Instalación completa de tubos de abasto, desagüe y grifería.',
    precio_base: 2500,
    unidad: 'servicio',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'serv-2',
    nombre: 'Destape de Drenaje / Cañería',
    categoria: 'plomería',
    descripcion: 'Destape con sonda eléctrica en cocina o baño.',
    precio_base: 3500,
    unidad: 'servicio',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'serv-3',
    nombre: 'Instalación de Breaker y Tablero Eléctrico',
    categoria: 'electricidad',
    descripcion: 'Sustitución o montaje de breaker principal e iluminación.',
    precio_base: 1800,
    unidad: 'unidad',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'serv-4',
    nombre: 'Pintura de Interiores (M²)',
    categoria: 'pintura',
    descripcion: 'Pintura acrílica mate / semigloss en paredes (no incluye pintura).',
    precio_base: 250,
    unidad: 'm²',
    activo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'serv-5',
    nombre: 'Mantenimiento General / Inspección',
    categoria: 'otros',
    descripcion: 'Revisión técnica general de instalaciones.',
    precio_base: 1500,
    unidad: 'hora',
    activo: true,
    created_at: new Date().toISOString(),
  },
];

const DEFAULT_CLIENTES: Cliente[] = [
  {
    id: 'cli-1',
    nombre: 'Ing. Carlos Mendoza',
    telefono: '(809) 882-9901',
    email: 'carlos.mendoza@email.com',
    direccion: 'Residencial Las Praderas, Apto 3B, Santo Domingo',
    documento: '001-1827465-9',
    notas: 'Cliente recurrente. Prefiere facturas con NCF.',
    created_at: new Date().toISOString(),
  },
  {
    id: 'cli-2',
    nombre: 'Doña María Almonte',
    telefono: '(829) 451-2233',
    email: 'maria.almonte@gmail.com',
    direccion: 'Calle Sol Poniente #42, Bella Vista, Santo Domingo',
    documento: '001-0982736-1',
    notas: 'Trabajos de fontanería y pintura exterior.',
    created_at: new Date().toISOString(),
  },
  {
    id: 'cli-3',
    nombre: 'Colmado La Fe S.R.L.',
    telefono: '(809) 530-1122',
    email: 'contacto@colmadolafe.do',
    direccion: 'Av. Independencia #88, Gazcue, Santo Domingo',
    documento: '1-01-99887-5',
    notas: 'Préstamo de capital de trabajo concedido.',
    created_at: new Date().toISOString(),
  },
];

const INITIAL_COTIZACIONES: Cotizacion[] = [
  {
    id: 'cot-1',
    cliente_id: 'cli-1',
    numero: 'COT-2026-0001',
    fecha: new Date().toISOString().split('T')[0],
    validez_dias: 15,
    estado: 'enviada',
    subtotal: 7500,
    aplica_itbis: true,
    itbis: 1350,
    total: 8850,
    notas: 'Cotización para remodelación de 2 baños y cocina.',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 'citem-1',
        descripcion: 'Instalación de Fregadero / Lavamanos',
        cantidad: 2,
        precio_unitario: 2500,
        importe: 5000,
      },
      {
        id: 'citem-2',
        descripcion: 'Instalación de Breaker y Tablero Eléctrico',
        cantidad: 1,
        precio_unitario: 2500,
        importe: 2500,
      },
    ],
  },
];

const INITIAL_FACTURAS: Factura[] = [
  {
    id: 'fac-1',
    cliente_id: 'cli-2',
    cotizacion_id: undefined,
    numero: 'FAC-2026-0001',
    ncf: 'B0100000123',
    fecha: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    estado: 'parcial',
    subtotal: 10000,
    aplica_itbis: true,
    itbis: 1800,
    total: 11800,
    monto_pagado: 5000,
    saldo_pendiente: 6800,
    notas: 'Trabajos de destape y reparación de filtraciones.',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 'fitem-1',
        descripcion: 'Destape de Drenaje / Cañería principal',
        cantidad: 2,
        precio_unitario: 3500,
        importe: 7000,
      },
      {
        id: 'fitem-2',
        descripcion: 'Mantenimiento General / Inspección',
        cantidad: 2,
        precio_unitario: 1500,
        importe: 3000,
      },
    ],
    pagos: [
      {
        id: 'pago-1',
        factura_id: 'fac-1',
        monto: 5000,
        fecha: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        metodo: 'transferencia',
        referencia: 'TR-987123',
        created_at: new Date().toISOString(),
      },
    ],
  },
];

function buildInitialCuotas(prestamoId: string, montoPrestado: number, tasa: number, numCuotas: number, frecuencia: 'semanal' | 'quincenal' | 'mensual', fechaInicio: string): Cuota[] {
  const interesTotal = roundMoney(montoPrestado * (tasa / 100));
  const totalAPagar = roundMoney(montoPrestado + interesTotal);
  const cuotaBase = roundMoney(totalAPagar / numCuotas);
  
  const cuotas: Cuota[] = [];
  let acumulado = 0;

  for (let i = 1; i <= numCuotas; i++) {
    let montoCuota = cuotaBase;
    if (i === numCuotas) {
      montoCuota = roundMoney(totalAPagar - acumulado);
    } else {
      acumulado = roundMoney(acumulado + cuotaBase);
    }

    const daysStep = frecuencia === 'semanal' ? 7 : frecuencia === 'quincenal' ? 15 : 30;
    const fechaVenc = addDaysToDate(fechaInicio, daysStep * i);
    const isFirstPaid = i === 1;

    cuotas.push({
      id: `cuota-${prestamoId}-${i}`,
      prestamo_id: prestamoId,
      numero: i,
      fecha_vencimiento: fechaVenc,
      monto: montoCuota,
      monto_pagado: isFirstPaid ? montoCuota : 0,
      estado: isFirstPaid ? 'pagada' : 'pendiente',
    });
  }

  return cuotas;
}

const INITIAL_PRESTAMOS: Prestamo[] = [
  {
    id: 'pres-1',
    cliente_id: 'cli-3',
    monto_prestado: 50000,
    tasa_interes: 10,
    interes_total: 5000,
    total_a_pagar: 55000,
    num_cuotas: 5,
    frecuencia: 'quincenal',
    fecha_inicio: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    estado: 'activo',
    created_at: new Date().toISOString(),
    cuotas: buildInitialCuotas('pres-1', 50000, 10, 5, 'quincenal', new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
  },
];

export function getInitialState(): AppState {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        clientes: parsed.clientes || DEFAULT_CLIENTES,
        servicios: parsed.servicios || DEFAULT_SERVICIOS,
        cotizaciones: parsed.cotizaciones || INITIAL_COTIZACIONES,
        facturas: parsed.facturas || INITIAL_FACTURAS,
        prestamos: parsed.prestamos || INITIAL_PRESTAMOS,
        pagos: parsed.pagos || [],
      };
    } catch (e) {
      console.error('Failed to parse saved app state', e);
    }
  }

  return {
    settings: DEFAULT_SETTINGS,
    clientes: DEFAULT_CLIENTES,
    servicios: DEFAULT_SERVICIOS,
    cotizaciones: INITIAL_COTIZACIONES,
    facturas: INITIAL_FACTURAS,
    prestamos: INITIAL_PRESTAMOS,
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
