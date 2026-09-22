import html2pdf from 'html2pdf.js';
import { normalizarColoresParaCaptura } from './colores';
import {
  FORMATOS,
  altoPaginaMm,
  type DefinicionFormato,
  type FormatoImpresion,
} from './formatosImpresion';

/**
 * Generación, descarga, compartición e impresión del documento.
 *
 * Todo parte del mismo nodo del DOM que ve el usuario en la vista previa:
 * ni se copia HTML a otra ventana ni se mantiene una segunda plantilla. Lo
 * que se ve es lo que se imprime y lo que se envía.
 */

function elementoODescartar(elementId: string, accion: string): HTMLElement {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`No se encontró el documento a ${accion}.`);
  }
  return element;
}

/**
 * Opciones de rasterizado para un formato concreto.
 *
 * El rollo térmico no tiene páginas: se le da un alto calculado a partir
 * del contenido para que el recibo salga de una sola tirada. Cortarlo cada
 * 297 mm lo partiría por la mitad. Además se rasteriza a más resolución,
 * porque la letra del recibo es diminuta.
 */
function opciones(filename: string, formato: DefinicionFormato, element: HTMLElement) {
  const alto = formato.termico ? altoPaginaMm(formato, element.scrollHeight) : 297;

  // La hoja A4 se captura sin su relleno inferior: el margen de la página
  // ya deja ese blanco, y cuando el contenido llenaba la hoja justo, esos
  // píxeles vacíos abrían una segunda página en blanco. Se quita en la copia
  // que rasteriza html2canvas —cuando html2pdf ya metió sus saltos de
  // página, que alargan la hoja—, nunca en la vista previa.
  const sinRellenoInferior = formato.termico
    ? {}
    : {
        onclone: (copia: Document) => {
          copia.querySelectorAll<HTMLElement>('.documento-a4').forEach((hoja) => {
            hoja.style.paddingBottom = '0px';
          });
        },
      };

  return {
    margin: [
      formato.margenVerticalMm,
      formato.margenLateralMm,
      formato.margenVerticalMm,
      formato.margenLateralMm,
    ] as [number, number, number, number],
    filename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: formato.termico ? 3 : 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      ...sinRellenoInferior,
    },
    jsPDF: {
      unit: 'mm',
      format: [formato.papelMm, alto] as [number, number],
      orientation: 'portrait' as const,
    },
    // Los cortes que no deben partir filas ni bloques los resuelve
    // `evitarCortes`; html2pdf sólo atiende los saltos explícitos.
    pagebreak: { mode: ['legacy'] },
  };
}

/**
 * Ejecuta la captura con los colores traducidos a sRGB y los restaura al
 * terminar.
 *
 * `html2canvas` es de 2022 y no entiende la paleta `oklch()` de Tailwind 4:
 * sin esta traducción la descarga fallaba con «Attempting to parse an
 * unsupported color function "oklch"» (ver `utils/colores.ts`).
 */
async function conColoresNormalizados<T>(
  element: HTMLElement,
  tarea: () => Promise<T>
): Promise<T> {
  const restaurarColores = normalizarColoresParaCaptura(element);
  try {
    return await tarea();
  } finally {
    restaurarColores();
  }
}

/** Lo que el trabajo de html2pdf deja ver de su estado al encadenarlo. */
interface EstadoTrabajoPdf {
  opt: { html2canvas?: { scale?: number } };
  prop: { container: HTMLElement; pageSize: { inner: { ratio: number } } };
}

/**
 * Alto de cada página en píxeles CSS, tal como la corta html2pdf: el lienzo
 * de html2canvas mide el ancho de la copia, redondeado hacia arriba, por la
 * escala; cada página es ese ancho por la proporción de la hoja.
 */
function altoDePagina(trabajo: EstadoTrabajoPdf): number {
  const escala = Number(trabajo.opt.html2canvas?.scale) || 1;
  const ancho = Math.ceil(trabajo.prop.container.getBoundingClientRect().width);
  return Math.floor(Math.floor(ancho * escala) * trabajo.prop.pageSize.inner.ratio) / escala;
}

/**
 * Empuja a la página siguiente lo que quedaría partido por un corte.
 *
 * html2pdf rebana el lienzo cada tantos píxeles, caiga donde caiga: en una
 * factura larga una línea quedaba con media letra en cada hoja. Su opción
 * `avoid` lo arreglaría, pero mete un `<div>` dentro de la tabla y
 * html2canvas se cuelga con él. Aquí se recorre la copia en orden y, antes
 * de cada fila o bloque indivisible que cruce un corte, se inserta un
 * espaciador válido: una fila vacía en las tablas, un bloque en lo demás.
 */
function evitarCortes(contenedor: HTMLElement, altoPagina: number): void {
  if (!(altoPagina > 0)) return;
  const origen = contenedor.getBoundingClientRect().top;
  const indivisibles = Array.from(contenedor.querySelectorAll<HTMLElement>('*')).filter(
    (el) => el.matches('tbody > tr') || getComputedStyle(el).breakInside === 'avoid'
  );

  for (const el of indivisibles) {
    // Se mide en cada vuelta: cada espaciador desplaza lo que viene detrás
    const caja = el.getBoundingClientRect();
    if (caja.height === 0 || caja.height >= altoPagina) continue;
    const arriba = caja.top - origen;
    const pagina = Math.floor(arriba / altoPagina);
    if (caja.bottom - origen <= (pagina + 1) * altoPagina) continue;

    const nuevo = espaciador(el, Math.ceil((pagina + 1) * altoPagina - arriba) + 2);
    el.before(nuevo);
    // Nace después de traducir los colores de la hoja: hereda de la tabla
    // bordes en `oklch()` que html2canvas no sabe leer y harían fallar
    // la captura entera.
    normalizarColoresParaCaptura(nuevo);
  }
}

function espaciador(antesDe: HTMLElement, alto: number): HTMLElement {
  if (antesDe instanceof HTMLTableRowElement) {
    const fila = document.createElement('tr');
    const celda = fila.insertCell();
    celda.colSpan = Array.from(antesDe.cells).reduce((suma, c) => suma + c.colSpan, 0) || 1;
    celda.style.cssText = `height:${alto}px;padding:0;border:0`;
    return fila;
  }
  const bloque = document.createElement('div');
  bloque.style.height = `${alto}px`;
  return bloque;
}

/**
 * El trabajo de html2pdf con la copia ya preparada y sus cortes ajustados.
 * html2pdf encadena como una promesa que comparte su estado: se prepara la
 * copia, se corrigen los cortes y la captura parte de ahí.
 */
function trabajoPdf(element: HTMLElement, filename: string, formato: FormatoImpresion) {
  const trabajo = html2pdf()
    .set(opciones(filename, FORMATOS[formato], element))
    .from(element)
    .toContainer();
  return trabajo.then(function (this: EstadoTrabajoPdf) {
    evitarCortes(this.prop.container, altoDePagina(this));
  }) as unknown as typeof trabajo;
}

export async function generatePdfFromElement(
  elementId: string,
  filename: string,
  formato: FormatoImpresion = 'a4'
): Promise<void> {
  const element = elementoODescartar(elementId, 'exportar');
  await conColoresNormalizados(element, () => trabajoPdf(element, filename, formato).save());
}

/** El mismo PDF de la descarga, en memoria, para poder compartirlo. */
export async function generarPdfBlob(
  elementId: string,
  filename: string,
  formato: FormatoImpresion = 'a4'
): Promise<Blob> {
  const element = elementoODescartar(elementId, 'exportar');
  const salida = await conColoresNormalizados(element, () =>
    trabajoPdf(element, filename, formato).outputPdf('blob')
  );
  return salida instanceof Blob ? salida : new Blob([salida], { type: 'application/pdf' });
}

export async function generarPdfFile(
  elementId: string,
  filename: string,
  formato: FormatoImpresion = 'a4'
): Promise<File> {
  const blob = await generarPdfBlob(elementId, filename, formato);
  return new File([blob], filename, { type: 'application/pdf' });
}

/** Descarga un archivo ya generado (respaldo cuando no se puede compartir). */
export function descargarArchivo(archivo: File): void {
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = archivo.name;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Revocar de inmediato aborta la descarga en algunos navegadores.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ResultadoCompartir = 'compartido' | 'cancelado' | 'sin-soporte';

/**
 * Comparte el PDF con la hoja nativa del sistema (WhatsApp, Correo, AirDrop…).
 *
 * No se elige el destinatario desde la app: se entrega el archivo al sistema
 * y es el usuario quien escoge el contacto dentro de WhatsApp. En navegadores
 * de escritorio, donde la Web Share API no admite archivos, se devuelve
 * `sin-soporte` para que la vista aplique su respaldo.
 */
export async function compartirArchivo(
  archivo: File,
  titulo: string,
  texto: string
): Promise<ResultadoCompartir> {
  const datos: ShareData = { files: [archivo], title: titulo, text: texto };

  if (typeof navigator.share !== 'function' || !navigator.canShare?.(datos)) {
    return 'sin-soporte';
  }

  try {
    await navigator.share(datos);
    return 'compartido';
  } catch (e) {
    // El usuario cerró la hoja de compartir: no es un error que avisar.
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado';
    throw e;
  }
}

/**
 * Imprime el documento tal como se ve en pantalla.
 *
 * La versión original copiaba `innerHTML` a una ventana en blanco con
 * `document.write`: perdía todas las clases de Tailwind (lo impreso no se
 * parecía a la vista previa) y ejecutaba el HTML que un usuario hubiera
 * metido en la descripción de una línea.
 *
 * Aquí se marca el propio elemento y toda su cadena de ancestros —modal,
 * contenedor con scroll, fondo difuminado— para que la hoja `@media print`
 * de `index.css` los neutralice y deje ver el documento intacto. No se copia
 * ni se reinterpreta ningún HTML.
 */
export function printDocumentElement(elementId: string, formato: FormatoImpresion = 'a4'): void {
  const element = elementoODescartar(elementId, 'imprimir');
  const def = FORMATOS[formato];

  const ancestros: HTMLElement[] = [];
  for (let p = element.parentElement; p && p !== document.body; p = p.parentElement) {
    ancestros.push(p);
  }

  // El tamaño de página se inyecta aquí y no en la hoja de estilos porque
  // `@page` no se puede condicionar con una clase: el rollo necesita
  // `80mm auto` —alto continuo, sin cortes— y la hoja necesita A4.
  const hoja = document.createElement('style');
  hoja.textContent = def.termico
    ? `@page { size: ${def.papelMm}mm auto; margin: ${def.margenVerticalMm}mm ${def.margenLateralMm}mm; }`
    : `@page { size: A4 portrait; margin: ${def.margenVerticalMm}mm ${def.margenLateralMm}mm; }`;
  document.head.appendChild(hoja);

  element.classList.add('zona-impresion');
  ancestros.forEach((el) => el.classList.add('ruta-impresion'));
  document.body.classList.add('imprimiendo');

  let limpiado = false;
  const limpiar = () => {
    if (limpiado) return;
    limpiado = true;
    element.classList.remove('zona-impresion');
    ancestros.forEach((el) => el.classList.remove('ruta-impresion'));
    document.body.classList.remove('imprimiendo');
    hoja.remove();
    window.removeEventListener('afterprint', limpiar);
  };

  window.addEventListener('afterprint', limpiar);
  window.print();

  // Respaldo para los navegadores que no emiten `afterprint`
  window.setTimeout(limpiar, 3000);
}
