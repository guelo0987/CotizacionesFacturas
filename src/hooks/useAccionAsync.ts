import { useCallback, useRef, useState } from 'react';
import { useFeedback, mensajeDeError } from '../components/feedback/contexto';

/**
 * Envuelve una operación asíncrona: bloquea el reenvío mientras está en
 * curso y muestra el error si falla.
 *
 * Resuelve dos problemas de golpe: un doble clic en "Guardar" creaba dos
 * facturas, y los fallos del servidor no llegaban nunca al usuario.
 *
 * Devuelve `true` si la operación terminó bien.
 */
export function useAccionAsync() {
  const { error: avisarError } = useFeedback();
  const [ejecutando, setEjecutando] = useState(false);
  const enCurso = useRef(false);

  const ejecutar = useCallback(
    async (operacion: () => Promise<void>): Promise<boolean> => {
      if (enCurso.current) return false;

      enCurso.current = true;
      setEjecutando(true);
      try {
        await operacion();
        return true;
      } catch (e) {
        avisarError(mensajeDeError(e));
        return false;
      } finally {
        enCurso.current = false;
        setEjecutando(false);
      }
    },
    [avisarError]
  );

  return { ejecutando, ejecutar };
}
