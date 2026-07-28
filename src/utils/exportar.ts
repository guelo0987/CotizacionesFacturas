/**
 * Exportación a CSV compatible con Excel.
 */

/**
 * Escapa un valor para CSV.
 *
 * Además de las comillas, neutraliza la inyección de fórmulas: una celda
 * que empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro es
 * interpretada como fórmula por Excel y LibreOffice. Como el contenido
 * viene de campos que escribe el usuario (descripciones, notas, nombres de
 * cliente), un `=HYPERLINK(...)` acabaría ejecutándose en la máquina de
 * quien abra el archivo.
 */
function escaparCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';

  let texto = String(valor);

  if (/^[=+\-@\t\r]/.test(texto)) {
    texto = `'${texto}`;
  }

  if (/[",\n\r;]/.test(texto)) {
    texto = `"${texto.replace(/"/g, '""')}"`;
  }

  return texto;
}

/** Marca de orden de bytes: hace que Excel reconozca el archivo como UTF-8. */
const BOM = '\uFEFF';

export function generarCSV(cabeceras: string[], filas: unknown[][]): string {
  const lineas = [
    cabeceras.map(escaparCelda).join(','),
    ...filas.map((fila) => fila.map(escaparCelda).join(',')),
  ];
  // El BOM hace que Excel reconozca UTF-8 y muestre bien las tildes y la ñ
  return `${BOM}${lineas.join('\r\n')}`;
}

export function descargarCSV(nombreArchivo: string, contenido: string): void {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo.endsWith('.csv') ? nombreArchivo : `${nombreArchivo}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  // Liberar la URL en el siguiente ciclo, cuando la descarga ya arrancó
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre de archivo con marca temporal, seguro para cualquier sistema. */
export function nombreConFecha(base: string): string {
  const ahora = new Date();
  const sello = [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-');
  const limpio = base.replace(/[^\p{L}\p{N}_-]/gu, '_');
  return `${limpio}_${sello}.csv`;
}
