import { getSupabaseClient } from './supabaseClient';
import type { Cliente, Servicio, Cotizacion, Factura, Prestamo, Pago } from '../types';

export const supabaseDataService = {
  // --- CLIENTES ---
  async fetchClientes(): Promise<Cliente[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase.from('clientes').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchClientes warning:', error.message);
      return [];
    }
    return data || [];
  },

  async createCliente(cliente: Omit<Cliente, 'id' | 'created_at'>): Promise<Cliente | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.from('clientes').insert([cliente]).select().single();
    if (error) {
      console.warn('Supabase createCliente warning:', error.message);
      return null;
    }
    return data;
  },

  async updateCliente(id: string, updates: Partial<Cliente>): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase.from('clientes').update(updates).eq('id', id);
    return !error;
  },

  async deleteCliente(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    return !error;
  },

  // --- SERVICIOS ---
  async fetchServicios(): Promise<Servicio[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase.from('servicios').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchServicios warning:', error.message);
      return [];
    }
    return data || [];
  },

  async createServicio(servicio: Omit<Servicio, 'id' | 'created_at'>): Promise<Servicio | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.from('servicios').insert([servicio]).select().single();
    if (error) {
      console.warn('Supabase createServicio warning:', error.message);
      return null;
    }
    return data;
  },

  async updateServicio(id: string, updates: Partial<Servicio>): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase.from('servicios').update(updates).eq('id', id);
    return !error;
  },

  async deleteServicio(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase.from('servicios').delete().eq('id', id);
    return !error;
  },

  // --- COTIZACIONES ---
  async fetchCotizaciones(): Promise<Cotizacion[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase.from('cotizaciones').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchCotizaciones warning:', error.message);
      return [];
    }
    return data || [];
  },

  async createCotizacion(cotizacion: Omit<Cotizacion, 'id' | 'created_at'>): Promise<Cotizacion | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { items, ...cotData } = cotizacion;
    const { data, error } = await supabase.from('cotizaciones').insert([cotData]).select().single();
    if (error) {
      console.warn('Supabase createCotizacion warning:', error.message);
      return null;
    }
    return data;
  },

  async updateCotizacion(id: string, updates: Partial<Cotizacion>): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { items, ...cotData } = updates;
    const { error } = await supabase.from('cotizaciones').update(cotData).eq('id', id);
    return !error;
  },

  async deleteCotizacion(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
    return !error;
  },

  // --- FACTURAS ---
  async fetchFacturas(): Promise<Factura[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase.from('facturas').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchFacturas warning:', error.message);
      return [];
    }
    return data || [];
  },

  async createFactura(factura: Omit<Factura, 'id' | 'created_at'>): Promise<Factura | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { items, pagos, ...facData } = factura;
    const { data, error } = await supabase.from('facturas').insert([facData]).select().single();
    if (error) {
      console.warn('Supabase createFactura warning:', error.message);
      return null;
    }
    return data;
  },

  async updateFactura(id: string, updates: Partial<Factura>): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { items, pagos, ...facData } = updates;
    const { error } = await supabase.from('facturas').update(facData).eq('id', id);
    return !error;
  },

  async deleteFactura(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase.from('facturas').delete().eq('id', id);
    return !error;
  },

  // --- PRESTAMOS ---
  async fetchPrestamos(): Promise<Prestamo[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase.from('prestamos').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchPrestamos warning:', error.message);
      return [];
    }
    return data || [];
  },

  async createPrestamo(prestamo: Omit<Prestamo, 'id' | 'created_at'>): Promise<Prestamo | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { cuotas, ...presData } = prestamo;
    const { data, error } = await supabase.from('prestamos').insert([presData]).select().single();
    if (error) {
      console.warn('Supabase createPrestamo warning:', error.message);
      return null;
    }
    return data;
  },

  async deletePrestamo(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase.from('prestamos').delete().eq('id', id);
    return !error;
  },

  // --- PAGOS ---
  async fetchPagos(): Promise<Pago[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase.from('pagos').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchPagos warning:', error.message);
      return [];
    }
    return data || [];
  },

  async createPago(pago: Omit<Pago, 'id' | 'created_at'>): Promise<Pago | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.from('pagos').insert([pago]).select().single();
    if (error) {
      console.warn('Supabase createPago warning:', error.message);
      return null;
    }
    return data;
  }
};
