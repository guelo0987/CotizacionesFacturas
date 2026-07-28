import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Credenciales del proyecto Supabase.
 *
 * Salen exclusivamente de variables de entorno. No hay valor por defecto a
 * propósito: un proyecto cableado en el código hacía que todos los negocios
 * compartieran la misma base de datos.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configuracionCompleta = Boolean(url && anonKey);

let cliente: SupabaseClient | null = null;

if (configuracionCompleta) {
  cliente = createClient(url!, anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * Devuelve el cliente de Supabase, o `null` si la aplicación no está
 * configurada. Quien lo use debe contemplar el caso nulo.
 */
export function getSupabaseClient(): SupabaseClient | null {
  return cliente;
}

/**
 * Igual que `getSupabaseClient` pero lanza si falta configuración. Para las
 * rutas de datos, donde seguir sin conexión sólo produciría fallos silenciosos.
 */
export function requireSupabaseClient(): SupabaseClient {
  if (!cliente) {
    throw new Error(
      'La aplicación no está configurada: faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
    );
  }
  return cliente;
}
