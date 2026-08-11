import type { PostgrestError } from '@supabase/supabase-js';
import { requireSupabaseClient } from './supabaseClient';
import type {
  BusinessSettings,
  Cliente,
  Cotizacion,
  Factura,
  LineaDocumento,
  MetodoPago,
  Pago,
  Prestamo,
  Servicio,
} from '../types';

/**
 * Error de datos con mensaje ya legible en español.
 *
 * Antes cada método tragaba el fallo con `console.warn` y devolvía `null`,
 * y la interfaz fabricaba un registro local con id inventado: el usuario
 * veía "guardado" cuando en realidad no se había guardado nada.
 */
export class ErrorDatos extends Error {
  readonly causa?: PostgrestError | Error;

  constructor(mensaje: string, causa?: PostgrestError | Error) {
    super(mensaje);
    this.name = 'ErrorDatos';
    this.causa = causa;
  }
}

/** Traduce los errores de Postgres a algo que un dueño de negocio entienda. */
function traducir(error: PostgrestError, accion: string): ErrorDatos {
  const detalle = error.message ?? '';

  // Los `raise exception` de las funciones RPC ya vienen redactados en español
  if (error.code === 'P0001') {
    return new ErrorDatos(detalle, error);
  }

  switch (error.code) {
    case '23505':
      return new ErrorDatos('Ya existe un registro con ese valor único.', error);
    case '23503':
      return new ErrorDatos(
        'No se puede completar: el registro está vinculado a otros documentos.',
        error
      );
    case '23514':
      return new ErrorDatos('Algún dato no cumple las reglas del sistema.', error);
    case '42501':
    case 'PGRST301':
      return new ErrorDatos('No tienes permiso para hacer esto. Vuelve a iniciar sesión.', error);
    default:
      if (/fetch|network|failed to fetch/i.test(detalle)) {
        return new ErrorDatos('Sin conexión. Revisa tu internet e inténtalo de nuevo.', error);
      }
      return new ErrorDatos(`No se pudo ${accion}. ${detalle}`.trim(), error);
  }
}

function lanzarSiFalla<T>(
  respuesta: { data: T; error: PostgrestError | null },
  accion: string
): T {
  if (respuesta.error) throw traducir(respuesta.error, accion);
  return respuesta.data;
}

/** Normaliza las líneas antes de enviarlas: sin ids locales ni campos calculados. */
function normalizarLineas(items: LineaDocumento[] | undefined) {
  return (items ?? []).map((it) => ({
    servicio_id: it.servicio_id || null,
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
  }));
}

export const supabaseDataService = {
  // ===================================================================
  // Sesión y organización
  // ===================================================================

  async obtenerPerfil(): Promise<{ organizacion_id: string; nombre: string | null } | null> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('perfiles')
      .select('organizacion_id, nombre')
      .maybeSingle();

    if (error) throw traducir(error, 'cargar tu perfil');
    return data;
  },

  async crearOrganizacion(nombre: string, rnc?: string): Promise<string> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.rpc('crear_organizacion', {
      p_nombre: nombre,
      p_rnc: rnc || null,
    });
    if (error) throw traducir(error, 'crear tu negocio');
    return data as string;
  },

  /**
   * Marca cuotas vencidas como atrasadas y vence cotizaciones caducadas.
   * Sin esto el contador de atrasos del panel se queda siempre en cero.
   */
  async actualizarAtrasos(): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.rpc('actualizar_atrasos');
    if (error) throw traducir(error, 'actualizar los vencimientos');
  },

  // ===================================================================
  // Configuración del negocio
  // ===================================================================

  async fetchConfiguracion(): Promise<BusinessSettings | null> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('configuracion_negocio')
      .select('business_name, phone, email, address, documento, logo_url, qr_url, itbis_rate, currency')
      .maybeSingle();

    if (error) throw traducir(error, 'cargar la configuración');
    if (!data) return null;

    return {
      business_name: data.business_name ?? 'Mi Negocio',
      phone: data.phone ?? '',
      email: data.email ?? '',
      address: data.address ?? '',
      documento: data.documento ?? '',
      logo_url: data.logo_url ?? '',
      qr_url: data.qr_url ?? '',
      itbis_rate: Number(data.itbis_rate ?? 18),
      currency: data.currency ?? 'RD$',
    };
  },

  async guardarConfiguracion(
    organizacionId: string,
    settings: BusinessSettings
  ): Promise<BusinessSettings> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('configuracion_negocio')
      .upsert(
        { organizacion_id: organizacionId, ...settings, updated_at: new Date().toISOString() },
        { onConflict: 'organizacion_id' }
      )
      .select()
      .single();

    if (error) throw traducir(error, 'guardar la configuración');
    return { ...settings, itbis_rate: Number(data.itbis_rate) };
  },

  /**
   * Sube una imagen del negocio (logo o código QR) y devuelve su URL
   * pública. Ambas van al mismo bucket, dentro de la carpeta de la
   * organización, que es lo que filtran las políticas de Storage.
   *
   * La URL se guarda aquí mismo, sin esperar al botón «Guardar perfil»:
   * el archivo ya está subido, así que dejar la referencia sin guardar
   * hacía creer que la imagen estaba puesta cuando en realidad se perdía
   * al cerrar los ajustes.
   */
  async subirImagenNegocio(
    organizacionId: string,
    archivo: File,
    tipo: 'logo' | 'qr'
  ): Promise<string> {
    const supabase = requireSupabaseClient();
    const extension = archivo.name.split('.').pop()?.toLowerCase() || 'png';
    const ruta = `${organizacionId}/${tipo}.${extension}`;
    const etiqueta = tipo === 'logo' ? 'el logo' : 'el código QR';

    const { error } = await supabase.storage
      .from('logos')
      .upload(ruta, archivo, { upsert: true, contentType: archivo.type });

    if (error) {
      throw new ErrorDatos(
        `No se pudo subir ${etiqueta}. ${error.message}`,
        error instanceof Error ? error : undefined
      );
    }

    const { data } = supabase.storage.from('logos').getPublicUrl(ruta);
    // El parámetro fuerza al navegador a soltar la versión anterior en caché
    const url = `${data.publicUrl}?v=${Date.now()}`;

    // La fila de configuración se crea junto con la organización
    // (`crear_organizacion`), así que siempre hay algo que actualizar.
    const { error: errorGuardado } = await supabase
      .from('configuracion_negocio')
      .update({
        [tipo === 'logo' ? 'logo_url' : 'qr_url']: url,
        updated_at: new Date().toISOString(),
      })
      .eq('organizacion_id', organizacionId);

    if (errorGuardado) throw traducir(errorGuardado, `guardar ${etiqueta}`);

    return url;
  },

  // ===================================================================
  // Clientes
  // ===================================================================

  async fetchClientes(): Promise<Cliente[]> {
    const supabase = requireSupabaseClient();
    return lanzarSiFalla(
      await supabase.from('clientes').select('*').order('nombre', { ascending: true }),
      'cargar los clientes'
    ) as Cliente[];
  },

  async createCliente(cliente: Omit<Cliente, 'id' | 'created_at' | 'activo'>): Promise<Cliente> {
    const supabase = requireSupabaseClient();
    return lanzarSiFalla(
      await supabase.from('clientes').insert([cliente]).select().single(),
      'crear el cliente'
    ) as Cliente;
  },

  async updateCliente(id: string, cambios: Partial<Cliente>): Promise<Cliente> {
    const supabase = requireSupabaseClient();
    const { id: _omitido, created_at: _fecha, ...datos } = cambios;
    return lanzarSiFalla(
      await supabase.from('clientes').update(datos).eq('id', id).select().single(),
      'actualizar el cliente'
    ) as Cliente;
  },

  async contarHistorialCliente(
    id: string
  ): Promise<{ cotizaciones: number; facturas: number; prestamos: number }> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.rpc('contar_historial_cliente', { p_cliente_id: id });
    if (error) throw traducir(error, 'consultar el historial del cliente');
    return data as { cotizaciones: number; facturas: number; prestamos: number };
  },

  /** Devuelve 'eliminado' o 'desactivado' según si el cliente tenía historial. */
  async deleteCliente(id: string): Promise<'eliminado' | 'desactivado'> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.rpc('eliminar_cliente', { p_cliente_id: id });
    if (error) throw traducir(error, 'eliminar el cliente');
    return data as 'eliminado' | 'desactivado';
  },

  // ===================================================================
  // Servicios
  // ===================================================================

  async fetchServicios(): Promise<Servicio[]> {
    const supabase = requireSupabaseClient();
    return lanzarSiFalla(
      await supabase.from('servicios').select('*').order('nombre', { ascending: true }),
      'cargar el catálogo de servicios'
    ) as Servicio[];
  },

  async createServicio(servicio: Omit<Servicio, 'id' | 'created_at'>): Promise<Servicio> {
    const supabase = requireSupabaseClient();
    return lanzarSiFalla(
      await supabase.from('servicios').insert([servicio]).select().single(),
      'crear el servicio'
    ) as Servicio;
  },

  async updateServicio(id: string, cambios: Partial<Servicio>): Promise<Servicio> {
    const supabase = requireSupabaseClient();
    const { id: _omitido, created_at: _fecha, ...datos } = cambios;
    return lanzarSiFalla(
      await supabase.from('servicios').update(datos).eq('id', id).select().single(),
      'actualizar el servicio'
    ) as Servicio;
  },

  async deleteServicio(id: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('servicios').delete().eq('id', id);
    if (error) throw traducir(error, 'eliminar el servicio');
  },

  // ===================================================================
  // Cotizaciones
  // ===================================================================

  async fetchCotizaciones(): Promise<Cotizacion[]> {
    const supabase = requireSupabaseClient();
    const data = lanzarSiFalla(
      await supabase
        .from('cotizaciones')
        .select('*, items:cotizacion_items(*)')
        .order('created_at', { ascending: false }),
      'cargar las cotizaciones'
    );
    return (data ?? []) as Cotizacion[];
  },

  /**
   * Alta y edición en una sola transacción: cabecera, líneas y numeración
   * correlativa. Los totales los recalcula el servidor a partir de las
   * líneas, así que el cliente no puede enviar un total manipulado.
   */
  async guardarCotizacion(
    datos: Partial<Cotizacion> & { cliente_id: string },
    items: LineaDocumento[]
  ): Promise<Cotizacion> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.rpc('guardar_cotizacion', {
      p_datos: {
        id: datos.id ?? null,
        cliente_id: datos.cliente_id,
        fecha: datos.fecha,
        validez_dias: datos.validez_dias,
        estado: datos.estado,
        aplica_itbis: datos.aplica_itbis,
        notas: datos.notas ?? '',
      },
      p_items: normalizarLineas(items),
    });

    if (error) throw traducir(error, 'guardar la cotización');
    return data as Cotizacion;
  },

  async actualizarEstadoCotizacion(id: string, estado: Cotizacion['estado']): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('cotizaciones').update({ estado }).eq('id', id);
    if (error) throw traducir(error, 'cambiar el estado de la cotización');
  },

  async deleteCotizacion(id: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
    if (error) throw traducir(error, 'eliminar la cotización');
  },

  async convertirEnFactura(cotizacionId: string): Promise<Factura> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.rpc('convertir_cotizacion_en_factura', {
      p_cotizacion_id: cotizacionId,
    });
    if (error) throw traducir(error, 'convertir la cotización en factura');
    return data as Factura;
  },

  // ===================================================================
  // Facturas
  // ===================================================================

  async fetchFacturas(): Promise<Factura[]> {
    const supabase = requireSupabaseClient();
    const data = lanzarSiFalla(
      await supabase
        .from('facturas')
        .select('*, items:factura_items(*), pagos:pagos(*)')
        .order('created_at', { ascending: false }),
      'cargar las facturas'
    );
    return (data ?? []) as Factura[];
  },

  async guardarFactura(
    datos: Partial<Factura> & { cliente_id: string },
    items: LineaDocumento[]
  ): Promise<Factura> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.rpc('guardar_factura', {
      p_datos: {
        id: datos.id ?? null,
        cliente_id: datos.cliente_id,
        cotizacion_id: datos.cotizacion_id ?? null,
        ncf: datos.ncf ?? null,
        fecha: datos.fecha,
        aplica_itbis: datos.aplica_itbis,
        notas: datos.notas ?? '',
      },
      p_items: normalizarLineas(items),
    });

    if (error) throw traducir(error, 'guardar la factura');
    return data as Factura;
  },

  async deleteFactura(id: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('facturas').delete().eq('id', id);
    if (error) throw traducir(error, 'eliminar la factura');
  },

  /** El servidor rechaza el sobrepago en vez de recortarlo en silencio. */
  async registrarPagoFactura(
    facturaId: string,
    monto: number,
    metodo: MetodoPago,
    referencia?: string
  ): Promise<Factura> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.rpc('registrar_pago_factura', {
      p_factura_id: facturaId,
      p_monto: monto,
      p_metodo: metodo,
      p_referencia: referencia ?? null,
    });

    if (error) throw traducir(error, 'registrar el pago');
    return data as Factura;
  },

  // ===================================================================
  // Préstamos
  // ===================================================================

  async fetchPrestamos(): Promise<Prestamo[]> {
    const supabase = requireSupabaseClient();
    const data = lanzarSiFalla(
      await supabase
        .from('prestamos')
        .select('*, cuotas:cuotas(*), pagos:pagos(*)')
        .order('created_at', { ascending: false }),
      'cargar los préstamos'
    );

    // Las cuotas deben venir siempre en orden de vencimiento
    return ((data ?? []) as Prestamo[]).map((p) => ({
      ...p,
      cuotas: [...(p.cuotas ?? [])].sort((a, b) => a.numero - b.numero),
    }));
  },

  /** El calendario de cuotas lo genera el servidor: una sola fórmula, un solo sitio. */
  async guardarPrestamo(datos: Partial<Prestamo> & { cliente_id: string }): Promise<Prestamo> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.rpc('guardar_prestamo', {
      p_datos: {
        id: datos.id ?? null,
        cliente_id: datos.cliente_id,
        monto_prestado: datos.monto_prestado,
        tasa_interes: datos.tasa_interes,
        num_cuotas: datos.num_cuotas,
        frecuencia: datos.frecuencia,
        modalidad_interes: datos.modalidad_interes ?? 'por_periodo',
        fecha_inicio: datos.fecha_inicio,
      },
    });

    if (error) throw traducir(error, 'guardar el préstamo');
    return data as Prestamo;
  },

  async deletePrestamo(id: string): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.from('prestamos').delete().eq('id', id);
    if (error) throw traducir(error, 'eliminar el préstamo');
  },

  /** Admite abonos parciales: el monto no tiene por qué ser la cuota completa. */
  async registrarPagoCuota(
    cuotaId: string,
    monto: number,
    metodo: MetodoPago,
    referencia?: string
  ): Promise<Prestamo> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.rpc('registrar_pago_cuota', {
      p_cuota_id: cuotaId,
      p_monto: monto,
      p_metodo: metodo,
      p_referencia: referencia ?? null,
    });

    if (error) throw traducir(error, 'registrar el abono de la cuota');
    return data as Prestamo;
  },

  // ===================================================================
  // Pagos
  // ===================================================================

  async fetchPagos(): Promise<Pago[]> {
    const supabase = requireSupabaseClient();
    return lanzarSiFalla(
      await supabase.from('pagos').select('*').order('fecha', { ascending: false }),
      'cargar los pagos'
    ) as Pago[];
  },
};
