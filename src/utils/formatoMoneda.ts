/**
 * Formato de los campos de dinero mientras se escribe.
 *
 * Un `<input type="number">` controlado por un número obliga a que el campo
 * muestre siempre algo: al borrarlo reaparecía un `0` pegado delante de lo
 * que se teclease («03000»). Aquí el campo trabaja con texto —puede quedar
 * vacío— y sólo se convierte a número cuando hay algo que convertir.
 */

/** Dígitos máximos en la parte entera: RD$ 999,999,999.99 */
const MAX_ENTEROS = 9;
const MAX_DECIMALES = 2;

export interface PartesMonto {
  entero: string;
  decimales: string | null;
}

/**
 * Reduce lo tecleado a dígitos y, como mucho, un separador decimal.
 *
 * La coma se descarta siempre: en República Dominicana —igual que en la
 * notación que usa la app— la coma separa los miles y el punto los
 * centavos, así que una coma tecleada es ruido, nunca un decimal.
 */
export function partirEntradaMoneda(bruto: string): PartesMonto {
  const soloValidos = String(bruto ?? '').replace(/[^\d.]/g, '');

  const primerPunto = soloValidos.indexOf('.');
  const entero = (primerPunto === -1 ? soloValidos : soloValidos.slice(0, primerPunto))
    .slice(0, MAX_ENTEROS)
    // «05» → «5», pero «0» se respeta: el usuario lo escribió a propósito.
    .replace(/^0+(?=\d)/, '');

  if (primerPunto === -1) return { entero, decimales: null };

  const decimales = soloValidos
    .slice(primerPunto + 1)
    .replace(/\./g, '')
    .slice(0, MAX_DECIMALES);

  return { entero: entero || '0', decimales };
}

/** Agrupa los miles: 3000 → 3,000 */
function agruparMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Texto que debe verse en el campo tras cada pulsación.
 * Conserva el punto final («3.») para poder seguir escribiendo decimales.
 */
export function formatearEntradaMoneda(bruto: string): string {
  const { entero, decimales } = partirEntradaMoneda(bruto);
  if (!entero && decimales === null) return '';
  const enteroFmt = agruparMiles(entero);
  return decimales === null ? enteroFmt : `${enteroFmt}.${decimales}`;
}

/**
 * Valor numérico del campo. `null` cuando está vacío, para distinguir
 * «todavía no ha escrito nada» de «escribió cero».
 */
export function parsearMoneda(texto: string): number | null {
  const { entero, decimales } = partirEntradaMoneda(texto);
  if (!entero && !decimales) return null;
  const n = Number(`${entero || '0'}.${decimales || '0'}`);
  return Number.isFinite(n) ? n : null;
}

/** Número guardado → texto editable: 3000 → «3,000.00» */
export function formatearMontoEditable(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '';
  const n = Number(valor);
  const negativo = n < 0;
  const [entero, decimales] = Math.abs(n).toFixed(MAX_DECIMALES).split('.');
  return `${negativo ? '-' : ''}${agruparMiles(entero)}.${decimales}`;
}

/**
 * Posición del cursor tras reformatear.
 *
 * Se cuenta cuántos caracteres «de verdad» (dígitos y punto) había antes del
 * cursor y se busca esa misma posición en el texto ya formateado, para que
 * insertar una coma de millares no mande el cursor al final.
 */
export function posicionCursor(formateado: string, significativosAntes: number): number {
  if (significativosAntes <= 0) return 0;
  let contados = 0;
  for (let i = 0; i < formateado.length; i++) {
    if (formateado[i] !== ',') contados++;
    if (contados === significativosAntes) return i + 1;
  }
  return formateado.length;
}

/** Cuenta dígitos y puntos en un fragmento de texto. */
export function contarSignificativos(texto: string): number {
  return (texto.match(/[\d.]/g) ?? []).length;
}
