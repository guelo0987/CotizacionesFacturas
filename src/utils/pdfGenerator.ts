import html2pdf from 'html2pdf.js';

export async function generatePdfFromElement(elementId: string, filename: string): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('No se encontró el documento a exportar.');
  }

  const opciones = {
    margin: [10, 10, 10, 10] as [number, number, number, number],
    filename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
  };

  await html2pdf().set(opciones).from(element).save();
}

/**
 * Imprime el documento tal como se ve en pantalla.
 *
 * La versión anterior copiaba `innerHTML` a una ventana en blanco con
 * `document.write`: perdía todas las clases de Tailwind (lo impreso no se
 * parecía a la vista previa) y ejecutaba el HTML que un usuario hubiera
 * metido en la descripción de una línea.
 *
 * Aquí se marca el elemento y se deja que la hoja `@media print` de
 * `index.css` oculte el resto de la página. No se copia ni se reinterpreta
 * ningún HTML.
 */
export function printDocumentElement(elementId: string): void {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('No se encontró el documento a imprimir.');
  }

  element.classList.add('zona-impresion');
  document.body.classList.add('imprimiendo');

  const limpiar = () => {
    element.classList.remove('zona-impresion');
    document.body.classList.remove('imprimiendo');
    window.removeEventListener('afterprint', limpiar);
  };

  window.addEventListener('afterprint', limpiar);
  window.print();

  // Respaldo para los navegadores que no emiten `afterprint`
  window.setTimeout(limpiar, 3000);
}
