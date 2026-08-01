import React, { useCallback, useState } from 'react';

interface CampoNumeroProps {
  id?: string;
  value: number | null;
  onChange: (valor: number | null) => void;
  /** Tope superior. Se aplica al escribir; el mínimo se valida al enviar. */
  max?: number;
  /** 0 = entero (por defecto). 2 = admite centavos o porcentajes con decimales. */
  decimales?: number;
  /** Texto fijo a la derecha, por ejemplo «%» o «días». */
  sufijo?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

const CLASE_BASE =
  'w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold ' +
  'text-slate-800 tabular-nums focus:outline-none focus:border-emerald-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-400';

/** Deja sólo dígitos y, si se admiten decimales, un único punto. */
function limpiar(bruto: string, decimales: number): string {
  let texto = String(bruto ?? '').replace(decimales > 0 ? /[^\d.]/g : /[^\d]/g, '');

  if (decimales > 0) {
    const punto = texto.indexOf('.');
    if (punto !== -1) {
      texto =
        texto.slice(0, punto + 1) +
        texto.slice(punto + 1).replace(/\./g, '').slice(0, decimales);
    }
  }

  // «08» → «8», pero se respeta el cero de «0.5» y el que se escribe solo.
  return texto.replace(/^0+(?=\d)/, '');
}

/**
 * Campo numérico entero o decimal (cuotas, días, porcentajes).
 *
 * Existe por el mismo motivo que `CampoMoneda`: un `<input type="number">`
 * controlado por un número no se puede dejar vacío. Al borrarlo reaparecía
 * el valor por defecto, así que para poner 8 cuotas donde había 1 había que
 * escribir «18» y luego borrar el 1.
 *
 * Aquí el campo admite quedarse vacío y emite `null`; el formulario valida
 * al enviar, que es donde el mensaje de error sirve de algo.
 */
export const CampoNumero: React.FC<CampoNumeroProps> = ({
  id,
  value,
  onChange,
  max,
  decimales = 0,
  sufijo,
  placeholder,
  className,
  disabled,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby,
}) => {
  const [texto, setTexto] = useState(value === null ? '' : String(value));

  // Sincroniza con los cambios que vienen de fuera (abrir en modo edición,
  // reiniciar el formulario) sin pisar lo que el usuario está escribiendo.
  const [valorPrevio, setValorPrevio] = useState(value);
  if (value !== valorPrevio) {
    setValorPrevio(value);
    if (value !== (texto === '' ? null : Number(texto))) {
      setTexto(value === null ? '' : String(value));
    }
  }

  const manejarCambio = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let limpio = limpiar(e.target.value, decimales);

      if (limpio === '' || limpio === '.') {
        setTexto(limpio);
        setValorPrevio(null);
        onChange(null);
        return;
      }

      let numero = Number(limpio);
      if (!Number.isFinite(numero)) return;

      if (max !== undefined && numero > max) {
        numero = max;
        limpio = String(max);
      }

      setTexto(limpio);
      setValorPrevio(numero);
      onChange(numero);
    },
    [decimales, max, onChange]
  );

  const entrada = (
    <input
      id={id}
      type="text"
      inputMode={decimales > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={texto}
      onChange={manejarCambio}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedby}
      className={`${CLASE_BASE}${sufijo ? ' pr-10' : ''}${className ? ` ${className}` : ''}`}
    />
  );

  if (!sufijo) return entrada;

  return (
    <div className="relative">
      {entrada}
      <span
        aria-hidden="true"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none select-none"
      >
        {sufijo}
      </span>
    </div>
  );
};
