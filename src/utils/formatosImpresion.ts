/**
 * Formatos de impresión de cotizaciones y facturas.
 *
 * Además de la hoja A4 de siempre, el documento se imprime en los dos
 * anchos de rollo térmico habituales del mostrador (80 mm y 58 mm), que es
 * lo que usan las impresoras Bluetooth con RawBT.
 *
 * Los anchos en píxeles equivalen a los milímetros de contenido a 96 ppp
 * (1 mm = 96/25.4 px), de modo que el PDF sale a tamaño natural y no hay
 * que reescalar nada.
 */

export type FormatoImpresion = 'a4' | '80mm' | '58mm';

export interface DefinicionFormato {
  etiqueta: string;
  detalle: string;
  /** Ancho del papel en milímetros: es el tamaño de página del PDF. */
  papelMm: number;
  /** Margen izquierdo y derecho, en milímetros. */
  margenLateralMm: number;
  /** Margen superior e inferior, en milímetros. */
  margenVerticalMm: number;
  /** Ancho del contenido en píxeles CSS = (papel − márgenes) a 96 ppp. */
  anchoPx: number;
  /** El rollo térmico es monocromo y de una sola página continua. */
  termico: boolean;
}

/** Píxeles CSS por milímetro a 96 ppp. */
export const PX_POR_MM = 96 / 25.4;

export const FORMATOS: Record<FormatoImpresion, DefinicionFormato> = {
  a4: {
    etiqueta: 'A4',
    detalle: 'Hoja completa · para correo o archivo',
    papelMm: 210,
    margenLateralMm: 10,
    margenVerticalMm: 10,
    anchoPx: 720,
    termico: false,
  },
  '80mm': {
    etiqueta: '80 mm',
    detalle: 'Rollo térmico ancho',
    papelMm: 80,
    margenLateralMm: 4,
    margenVerticalMm: 3,
    anchoPx: 272, // 72 mm
    termico: true,
  },
  '58mm': {
    etiqueta: '58 mm',
    detalle: 'Rollo térmico estrecho',
    papelMm: 58,
    margenLateralMm: 5,
    margenVerticalMm: 3,
    anchoPx: 181, // 48 mm
    termico: true,
  },
};

export const FORMATOS_VALIDOS = Object.keys(FORMATOS) as FormatoImpresion[];

export function formatoSeguro(valor: string | null | undefined): FormatoImpresion {
  return valor && valor in FORMATOS ? (valor as FormatoImpresion) : 'a4';
}

/**
 * Alto de página, en milímetros, para que el recibo salga de una sola
 * tirada. El rollo no tiene páginas: cortarlo cada 297 mm partiría el
 * documento por la mitad.
 */
export function altoPaginaMm(formato: DefinicionFormato, alturaContenidoPx: number): number {
  const anchoContenidoMm = formato.papelMm - formato.margenLateralMm * 2;
  const escala = anchoContenidoMm / formato.anchoPx;
  return alturaContenidoPx * escala + formato.margenVerticalMm * 2;
}
