import { describe, expect, it } from 'vitest';
import {
  contarSignificativos,
  formatearEntradaMoneda,
  formatearMontoEditable,
  parsearMoneda,
  posicionCursor,
} from './formatoMoneda';

describe('formatearEntradaMoneda', () => {
  it('agrupa los miles según se escribe', () => {
    expect(formatearEntradaMoneda('3000')).toBe('3,000');
    expect(formatearEntradaMoneda('1234567')).toBe('1,234,567');
  });

  it('deja el campo vacío cuando no hay nada escrito', () => {
    expect(formatearEntradaMoneda('')).toBe('');
    expect(formatearEntradaMoneda('RD$')).toBe('');
  });

  it('no arrastra el cero inicial delante de lo que se teclea', () => {
    // El fallo que se reportó: el campo mostraba «0» y al escribir quedaba «03000».
    expect(formatearEntradaMoneda('03000')).toBe('3,000');
    expect(formatearEntradaMoneda('05')).toBe('5');
  });

  it('respeta un cero escrito a propósito', () => {
    expect(formatearEntradaMoneda('0')).toBe('0');
    expect(formatearEntradaMoneda('0.5')).toBe('0.5');
  });

  it('conserva el punto mientras se escriben los centavos', () => {
    expect(formatearEntradaMoneda('3000.')).toBe('3,000.');
    expect(formatearEntradaMoneda('3000.5')).toBe('3,000.5');
  });

  it('admite como máximo dos decimales', () => {
    expect(formatearEntradaMoneda('12.3456')).toBe('12.34');
  });

  it('admite un solo separador decimal', () => {
    expect(formatearEntradaMoneda('12.34.56')).toBe('12.34');
  });

  it('descarta letras, símbolos y comas tecleadas', () => {
    expect(formatearEntradaMoneda('RD$ 2,500.75 pesos')).toBe('2,500.75');
    expect(formatearEntradaMoneda('-450')).toBe('450');
  });

  it('completa el entero cuando se empieza por el punto', () => {
    expect(formatearEntradaMoneda('.75')).toBe('0.75');
  });

  it('limita la parte entera a nueve dígitos', () => {
    expect(formatearEntradaMoneda('12345678901')).toBe('123,456,789');
  });
});

describe('parsearMoneda', () => {
  it('devuelve null cuando el campo está vacío', () => {
    expect(parsearMoneda('')).toBeNull();
    expect(parsearMoneda('RD$')).toBeNull();
  });

  it('distingue el campo vacío de un cero escrito', () => {
    expect(parsearMoneda('0')).toBe(0);
  });

  it('ignora los separadores de miles', () => {
    expect(parsearMoneda('1,234,567.89')).toBe(1234567.89);
  });

  it('interpreta un monto a medio escribir', () => {
    expect(parsearMoneda('3,000.')).toBe(3000);
  });
});

describe('formatearMontoEditable', () => {
  it('muestra siempre los dos decimales', () => {
    expect(formatearMontoEditable(3000)).toBe('3,000.00');
    expect(formatearMontoEditable(0)).toBe('0.00');
    expect(formatearMontoEditable(1234.5)).toBe('1,234.50');
  });

  it('deja el campo vacío sin monto', () => {
    expect(formatearMontoEditable(null)).toBe('');
    expect(formatearMontoEditable(undefined)).toBe('');
    expect(formatearMontoEditable(Number.NaN)).toBe('');
  });

  it('redondea a centavos', () => {
    expect(formatearMontoEditable(0.005)).toBe('0.01');
    expect(formatearMontoEditable(1999.999)).toBe('2,000.00');
  });
});

describe('cursor', () => {
  it('cuenta sólo dígitos y punto', () => {
    expect(contarSignificativos('1,234')).toBe(4);
    expect(contarSignificativos('RD$ 1,2')).toBe(2);
  });

  it('coloca el cursor detrás del mismo dígito tras insertar la coma', () => {
    // «1234» con el cursor al final → «1,234», el cursor sigue al final.
    expect(posicionCursor('1,234', 4)).toBe(5);
    // «1234» con el cursor tras el «2» → en «1,234» va tras el «2».
    expect(posicionCursor('1,234', 2)).toBe(3);
  });

  it('no se sale del texto', () => {
    expect(posicionCursor('1,234', 99)).toBe(5);
    expect(posicionCursor('1,234', 0)).toBe(0);
  });
});
