import { describe, expect, it } from 'vitest';
import { generarCSV, nombreConFecha } from './exportar';

describe('generarCSV', () => {
  it('escribe cabeceras y filas separadas por CRLF', () => {
    const csv = generarCSV(['A', 'B'], [[1, 2]]);
    expect(csv).toBe('\uFEFFA,B\r\n1,2');
  });

  it('empieza con el BOM para que Excel detecte UTF-8', () => {
    expect(generarCSV(['Año'], [['Ñoño']]).startsWith('\uFEFF')).toBe(true);
  });

  it('entrecomilla los valores con comas', () => {
    const csv = generarCSV(['A'], [['uno, dos']]);
    expect(csv).toContain('"uno, dos"');
  });

  it('duplica las comillas internas', () => {
    const csv = generarCSV(['A'], [['dice "hola"']]);
    expect(csv).toContain('"dice ""hola"""');
  });

  it('entrecomilla los saltos de línea', () => {
    const csv = generarCSV(['A'], [['linea1\nlinea2']]);
    expect(csv).toContain('"linea1\nlinea2"');
  });

  it('trata nulos y undefined como vacío', () => {
    const csv = generarCSV(['A', 'B'], [[null, undefined]]);
    expect(csv).toBe('\uFEFFA,B\r\n,');
  });

  // Inyección de fórmulas: el contenido viene de campos que escribe el
  // usuario, y Excel ejecutaría una celda que empiece por = + - @
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '=HYPERLINK("http://x","clic")'])(
    'neutraliza la fórmula %s',
    (peligroso) => {
      const csv = generarCSV(['A'], [[peligroso]]);
      const celda = csv.split('\r\n')[1];
      expect(celda.startsWith("'") || celda.startsWith('"\'')).toBe(true);
    }
  );

  it('no altera texto normal', () => {
    const csv = generarCSV(['A'], [['Juan Pérez']]);
    expect(csv).toBe('\uFEFFA\r\nJuan Pérez');
  });
});

describe('nombreConFecha', () => {
  it('añade la extensión csv', () => {
    expect(nombreConFecha('facturas').endsWith('.csv')).toBe(true);
  });

  it('sustituye los caracteres problemáticos para el sistema de archivos', () => {
    const nombre = nombreConFecha('reporte/de:ventas*2026');
    expect(nombre).not.toMatch(/[/:*]/);
  });

  it('conserva las tildes y la ñ', () => {
    expect(nombreConFecha('préstamos_año')).toContain('préstamos_año');
  });
});
