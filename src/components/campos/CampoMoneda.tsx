import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  contarSignificativos,
  formatearEntradaMoneda,
  formatearMontoEditable,
  parsearMoneda,
  posicionCursor,
} from '../../utils/formatoMoneda';

interface CampoMonedaProps {
  id?: string;
  value: number | null;
  onChange: (valor: number | null) => void;
  /** Se ejecuta también al salir del campo, ya con el monto redondeado. */
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

const CLASE_BASE =
  'w-full bg-white border border-slate-200 rounded-xl pl-12 pr-3 py-2 text-sm font-bold ' +
  'text-emerald-700 tabular-nums focus:outline-none focus:border-emerald-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-400';

/**
 * Campo de dinero en pesos dominicanos.
 *
 * Muestra el prefijo «RD$», agrupa los miles según se escribe y admite
 * quedarse vacío. Emite `null` mientras no haya nada escrito, para que el
 * formulario pueda distinguir «sin monto» de «cero» y no reaparezca el 0
 * pegado delante de lo que se teclea.
 */
export const CampoMoneda: React.FC<CampoMonedaProps> = ({
  id,
  value,
  onChange,
  onBlur,
  placeholder = '0.00',
  className,
  disabled,
  autoFocus,
  required,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorPendiente = useRef<number | null>(null);

  const [texto, setTexto] = useState(() => formatearMontoEditable(value));

  // Sincronización con cambios que vienen de fuera: abrir el formulario en
  // modo edición, el botón «abonar el saldo completo»… No se pisa lo que el
  // usuario está escribiendo, sólo se reescribe si el número ya no coincide.
  const [valorPrevio, setValorPrevio] = useState(value);
  if (value !== valorPrevio) {
    setValorPrevio(value);
    if (value !== parsearMoneda(texto)) setTexto(formatearMontoEditable(value));
  }

  useLayoutEffect(() => {
    if (cursorPendiente.current === null || !inputRef.current) return;
    const posicion = cursorPendiente.current;
    cursorPendiente.current = null;
    inputRef.current.setSelectionRange(posicion, posicion);
  }, [texto]);

  const manejarCambio = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const bruto = e.target.value;
      const seleccion = e.target.selectionStart ?? bruto.length;
      const formateado = formatearEntradaMoneda(bruto);

      cursorPendiente.current = posicionCursor(
        formateado,
        contarSignificativos(bruto.slice(0, seleccion))
      );

      setTexto(formateado);
      const numero = parsearMoneda(formateado);
      setValorPrevio(numero);
      onChange(numero);
    },
    [onChange]
  );

  const manejarBlur = useCallback(() => {
    // Al salir se muestran siempre los dos decimales: «3,000» → «3,000.00»
    const numero = parsearMoneda(texto);
    setTexto(formatearMontoEditable(numero));
    setValorPrevio(numero);
    onBlur?.();
  }, [texto, onBlur]);

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none select-none"
      >
        RD$
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={texto}
        onChange={manejarCambio}
        onBlur={manejarBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedby}
        className={className ? `${CLASE_BASE} ${className}` : CLASE_BASE}
      />
    </div>
  );
};
