export type CategoriaServicio = 'plomería' | 'electricidad' | 'pintura' | 'otros';
export type UnidadServicio = 'hora' | 'unidad' | 'm²' | 'servicio';

export type EstadoCotizacion = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'vencida';
export type EstadoFactura = 'pendiente' | 'parcial' | 'pagada' | 'anulada';
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';

export type FrecuenciaPrestamo =
  | 'diario'
  | 'semanal'
  | 'quincenal'
  | 'mensual'
  | 'bimestral'
  | 'trimestral'
  | 'semestral'
  | 'anual';

/**
 * Cómo se interpreta la tasa de interés del préstamo.
 *
 * - `por_periodo`: la tasa se cobra en cada cuota sobre el capital
 *   completo. «10% quincenal» a 4 cuotas quincenales son 40% de interés.
 *   El capital no baja hasta la última cuota. Modelo del prestamista
 *   dominicano.
 * - `amortizado`: cuota fija del sistema francés. La tasa se cobra sobre el
 *   saldo que queda, así que el interés baja cuota a cuota y el capital se
 *   va liquidando. Es el modelo de los bancos.
 * - `fijo_total`: la tasa se cobra una sola vez sobre el capital, sin
 *   importar el plazo. Es el modelo que usaban los préstamos creados antes
 *   de julio de 2026 y se conserva para no alterar sus números.
 */
export type ModalidadInteres = 'por_periodo' | 'amortizado' | 'fijo_total';

/**
 * Cómo se acumula la mora cuando hay varias cuotas vencidas a la vez.
 *
 * - `por_cuota`: cada cuota atrasada genera su propia mora diaria. Con dos
 *   cuotas vencidas y RD$100 al día, se acumulan RD$200 diarios.
 * - `por_prestamo`: una sola mora diaria mientras haya algo atrasado, que
 *   corre sobre la cuota vencida más antigua.
 */
export type ModoMora = 'por_cuota' | 'por_prestamo';

export type EstadoPrestamo = 'activo' | 'saldado' | 'atrasado';
export type EstadoCuota = 'pendiente' | 'parcial' | 'pagada' | 'atrasada';

export interface Organizacion {
  id: string;
  nombre: string;
  rnc: string | null;
  plan: 'prueba' | 'basico' | 'pro';
  estado: 'activa' | 'suspendida' | 'cancelada';
  created_at: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  documento: string; // RNC o Cédula
  notas: string;
  activo: boolean;
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

/** Línea de documento tal como la edita el formulario, antes de guardarse. */
export interface LineaDocumento {
  id?: string;
  servicio_id?: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
}

export type CotizacionItem = LineaDocumento;
export type FacturaItem = LineaDocumento;

export interface Cotizacion {
  id: string;
  cliente_id: string;
  numero: string; // COT-2026-0001, asignado por la base de datos
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
}

export interface Factura {
  id: string;
  cliente_id: string;
  cotizacion_id?: string | null;
  numero: string; // FAC-2026-0001, asignado por la base de datos
  ncf?: string | null;
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
  pagos?: Pago[];
}

export interface Pago {
  id: string;
  factura_id?: string | null;
  prestamo_id?: string | null;
  cuota_id?: string | null;
  monto: number;
  fecha: string;
  metodo: MetodoPago;
  /** Parte del pago que se aplicó a la mora; el resto va a la cuota. */
  monto_mora: number;
  /**
   * El pago formó parte de un saldo completo del préstamo. Un saldo genera
   * un pago por cada cuota que quedaba pendiente, y esta marca permite
   * reunirlos después para reimprimir el recibo de saldo.
   */
  saldo_de_prestamo: boolean;
  referencia?: string | null;
  created_at: string;
}

export interface Cuota {
  id: string;
  prestamo_id: string;
  numero: number;
  fecha_vencimiento: string;
  monto: number;
  /** Mora acumulada por el atraso. Deja de crecer al saldar la cuota. */
  mora_acumulada: number;
  /** Parte de esa mora que el cliente ya pagó. */
  mora_pagada: number;
  /** Parte de la cuota que es interés. */
  interes: number;
  /** Parte de la cuota que abona al capital. */
  capital: number;
  /** Capital que sigue debiéndose tras pagar esta cuota. */
  saldo_capital: number;
  monto_pagado: number;
  estado: EstadoCuota;
}

export interface Prestamo {
  id: string;
  cliente_id: string;
  monto_prestado: number;
  tasa_interes: number; // Porcentaje (%) por periodo o total, según la modalidad
  modalidad_interes: ModalidadInteres;
  interes_total: number;
  total_a_pagar: number;
  num_cuotas: number;
  frecuencia: FrecuenciaPrestamo;
  fecha_inicio: string;
  /** Mora por atraso: se habilita préstamo por préstamo, cuando hace falta. */
  mora_activa: boolean;
  /** Cuánto se cobra por cada día de atraso. */
  mora_diaria: number;
  mora_modo: ModoMora;
  /** Día en que se habilitó la mora. */
  mora_desde: string | null;
  /**
   * Si la mora alcanza a los atrasos anteriores a habilitarla.
   *
   * `false` (lo normal) la hace correr desde el día en que se activó, para
   * que encenderla en un préstamo con meses de atraso no haga aparecer de
   * golpe una deuda que el cliente nunca supo que tenía. `true` la cobra
   * desde el vencimiento de cada cuota, para el cliente al que sí se le
   * reclama lo ya atrasado.
   */
  mora_retroactiva: boolean;
  estado: EstadoPrestamo;
  created_at: string;
  cuotas?: Cuota[];
  pagos?: Pago[];
}

/**
 * Perfil comercial del negocio. Se guarda en Supabase
 * (`configuracion_negocio`), no en el navegador: cambiar de dispositivo no
 * puede hacer perder el logo, el RNC ni la tasa de ITBIS.
 */
export interface BusinessSettings {
  business_name: string;
  phone: string;
  email: string;
  address: string;
  documento: string; // RNC del negocio
  logo_url: string;
  /** Código QR del negocio (redes, catálogo, pago). Sale en los documentos. */
  qr_url: string;
  itbis_rate: number; // Por defecto 18%
  currency: string; // RD$
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
