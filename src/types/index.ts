export type CategoriaServicio = 'plomería' | 'electricidad' | 'pintura' | 'otros';
export type UnidadServicio = 'hora' | 'unidad' | 'm²' | 'servicio';

export type EstadoCotizacion = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'vencida';
export type EstadoFactura = 'pendiente' | 'parcial' | 'pagada';
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';

export type FrecuenciaPrestamo = 'semanal' | 'quincenal' | 'mensual';
export type EstadoPrestamo = 'activo' | 'saldado' | 'atrasado';
export type EstadoCuota = 'pendiente' | 'pagada' | 'atrasada';

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  documento: string; // RNC o Cédula
  notas: string;
  created_at: string;
}

export interface Servicio {
  id: string;
  nombre: string;
  categoria: CategoriaServicio;
  descripcion: string;
  precio_base: number;
  unidad: UnidadServicio;
  activo: boolean;
  created_at: string;
}

export interface CotizacionItem {
  id?: string;
  cotizacion_id?: string;
  servicio_id?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
}

export interface Cotizacion {
  id: string;
  cliente_id: string;
  numero: string; // e.g. COT-2026-0001
  fecha: string;
  validez_dias: number;
  estado: EstadoCotizacion;
  subtotal: number;
  aplica_itbis: boolean;
  itbis: number;
  total: number;
  notas: string;
  created_at: string;
  items?: CotizacionItem[];
  cliente?: Cliente;
}

export interface FacturaItem {
  id?: string;
  factura_id?: string;
  servicio_id?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
}

export interface Factura {
  id: string;
  cliente_id: string;
  cotizacion_id?: string;
  numero: string; // e.g. FAC-2026-0001
  ncf?: string;
  fecha: string;
  estado: EstadoFactura;
  subtotal: number;
  aplica_itbis: boolean;
  itbis: number;
  total: number;
  monto_pagado: number;
  saldo_pendiente: number;
  notas: string;
  created_at: string;
  items?: FacturaItem[];
  cliente?: Cliente;
  pagos?: Pago[];
}

export interface Pago {
  id: string;
  factura_id?: string;
  prestamo_id?: string;
  cuota_id?: string;
  monto: number;
  fecha: string;
  metodo: MetodoPago;
  referencia?: string;
  created_at: string;
}

export interface Cuota {
  id: string;
  prestamo_id: string;
  numero: number;
  fecha_vencimiento: string;
  monto: number;
  monto_pagado: number;
  estado: EstadoCuota;
}

export interface Prestamo {
  id: string;
  cliente_id: string;
  monto_prestado: number;
  tasa_interes: number; // Porcentaje (%)
  interes_total: number;
  total_a_pagar: number;
  num_cuotas: number;
  frecuencia: FrecuenciaPrestamo;
  fecha_inicio: string;
  estado: EstadoPrestamo;
  created_at: string;
  cuotas?: Cuota[];
  cliente?: Cliente;
  pagos?: Pago[];
}

export interface BusinessSettings {
  business_name: string;
  phone: string;
  email: string;
  address: string;
  documento: string; // RNC del negocio
  logo_url: string;
  itbis_rate: number; // Por defecto 18%
  currency: string; // RD$
  supabase_url?: string;
  supabase_anon_key?: string;
}

export interface AppState {
  settings: BusinessSettings;
  clientes: Cliente[];
  servicios: Servicio[];
  cotizaciones: Cotizacion[];
  facturas: Factura[];
  prestamos: Prestamo[];
  pagos: Pago[];
}

export type TabType = 'inicio' | 'clientes' | 'documentos' | 'prestamos';
