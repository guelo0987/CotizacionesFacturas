/**
 * Conversión de colores modernos (oklch, oklab, lab, lch, color-mix…) a
 * sRGB clásico.
 *
 * Tailwind 4 genera toda su paleta en `oklch()`. `html2canvas` —el motor que
 * usa `html2pdf.js` para rasterizar— es de 2022 y sólo entiende
 * `#rrggbb` / `rgb()` / `hsl()`: al toparse con un `oklch()` lanza
 * «Attempting to parse an unsupported color function "oklch"» y la descarga
 * del PDF falla.
 *
 * En vez de renunciar a la paleta, aquí se traduce cada color justo antes de
 * capturar y se restaura después. La conversión la hace el propio navegador
 * a través de `canvas.fillStyle`, que sí soporta los espacios de color
 * modernos y devuelve siempre `#rrggbb` o `rgba(...)`.
 */

/** Funciones de color que `html2canvas` no sabe interpretar. */
const FUNCIONES_MODERNAS = /\b(?:oklch|oklab|lch|lab|color|color-mix|hwb)\(/i;

/** Propiedades de color que se copian elemento por elemento. */
const PROPIEDADES_COLOR = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'column-rule-color',
  'caret-color',
  '-webkit-text-stroke-color',
  'fill',
  'stroke',
] as const;

/**
 * Propiedades compuestas donde un color moderno también rompe el parser.
 * No se traducen (haría falta reescribir el valor entero): se anulan, que es
 * justo lo que se quiere en papel.
 */
const PROPIEDADES_ANULABLES = ['box-shadow', 'text-shadow', 'background-image'] as const;

let contextoCache: CanvasRenderingContext2D | null | undefined;

function contexto(): CanvasRenderingContext2D | null {
  if (contextoCache !== undefined) return contextoCache;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    contextoCache = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    contextoCache = null;
  }
  return contextoCache;
}

/** Pinta el color en un píxel y devuelve sus componentes sRGB reales. */
function pintarYLeer(ctx: CanvasRenderingContext2D, previo: string, valor: string): string {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = previo;
  ctx.fillStyle = valor;
  ctx.fillRect(0, 0, 1, 1);

  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 255
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
}

/**
 * Traduce un color a `rgb()` / `rgba()`.
 *
 * No basta con asignar el color a `fillStyle` y volver a leerlo: los
 * navegadores actuales conservan el espacio de color de origen y devuelven
 * el mismo `oklch(...)` que se les dio. Hay que rasterizar un píxel y leer
 * sus bytes, que ya están en sRGB.
 *
 * Devuelve `null` si el valor no necesita traducción o si el navegador no lo
 * entiende. Se pinta dos veces sobre colores previos distintos porque, ante
 * un valor inválido, `fillStyle` ignora la asignación en silencio y
 * conservaría el color anterior: si ambas lecturas coinciden, el color se
 * interpretó de verdad.
 */
export function aColorClasico(valor: string): string | null {
  if (!valor || !FUNCIONES_MODERNAS.test(valor)) return null;

  const ctx = contexto();
  if (!ctx) return null;

  try {
    const primero = pintarYLeer(ctx, '#000000', valor);
    const segundo = pintarYLeer(ctx, '#ffffff', valor);
    return primero === segundo ? primero : null;
  } catch {
    return null;
  }
}

/**
 * Fija en línea el equivalente clásico de todo color moderno bajo `raiz`.
 *
 * Se aplica sobre el DOM real (no sobre el clon de html2canvas) porque el
 * clon vive en un iframe cuyas hojas de estilo pueden no haber cargado
 * todavía cuando toca leer los estilos calculados. El cambio es invisible
 * —mismo color, otra notación— y dura lo que dura la captura.
 *
 * @returns función que devuelve el documento a su estado original.
 */
export function normalizarColoresParaCaptura(raiz: HTMLElement): () => void {
  const restauraciones: Array<() => void> = [];

  const elementos: HTMLElement[] = [
    document.documentElement,
    document.body,
    raiz,
    ...Array.from(raiz.querySelectorAll<HTMLElement>('*')),
  ];

  for (const el of elementos) {
    if (!el || !el.style) continue;

    const calculado = window.getComputedStyle(el);
    const cambios: Array<[string, string]> = [];

    for (const prop of PROPIEDADES_COLOR) {
      const convertido = aColorClasico(calculado.getPropertyValue(prop));
      if (convertido) cambios.push([prop, convertido]);
    }

    for (const prop of PROPIEDADES_ANULABLES) {
      const valor = calculado.getPropertyValue(prop);
      if (valor && FUNCIONES_MODERNAS.test(valor)) {
        cambios.push([prop, prop === 'background-image' ? 'none' : 'none']);
      }
    }

    if (cambios.length === 0) continue;

    const anterior = el.getAttribute('style');
    restauraciones.push(() => {
      if (anterior === null) el.removeAttribute('style');
      else el.setAttribute('style', anterior);
    });

    for (const [prop, valor] of cambios) {
      el.style.setProperty(prop, valor, 'important');
    }
  }

  return () => {
    for (const restaurar of restauraciones) restaurar();
  };
}
