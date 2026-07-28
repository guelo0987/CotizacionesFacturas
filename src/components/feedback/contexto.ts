import { createContext, useContext } from 'react';

export type TipoAviso = 'exito' | 'error' | 'info';

export interface Aviso {
  id: number;
  tipo: TipoAviso;
  mensaje: string;
}

export interface OpcionesConfirmacion {
  titulo: string;
  mensaje: string;
  detalle?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  peligroso?: boolean;
}

export interface ContextoFeedback {
  exito: (mensaje: string) => void;
  error: (mensaje: string) => void;
  info: (mensaje: string) => void;
  confirmar: (opciones: OpcionesConfirmacion) => Promise<boolean>;
}

export const FeedbackContext = createContext<ContextoFeedback | null>(null);

export function useFeedback(): ContextoFeedback {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback debe usarse dentro de <FeedbackProvider>');
  }
  return ctx;
}

/**
 * Extrae un mensaje presentable de cualquier error.
 * Los `ErrorDatos` del servicio ya vienen redactados en español.
 */
export function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e.trim()) return e;
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}
