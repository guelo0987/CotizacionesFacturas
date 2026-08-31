/**
 * En 48 mm de ancho no caben dos importes con «RD$» delante en el mismo
 * renglón, así que en el rollo estrecho se deja sólo la cifra. El TOTAL sí
 * la lleva, para que la moneda quede clara en el recibo.
 */
export function montoTermico(valor: string, estrecho: boolean): string {
  return estrecho ? valor.replace(/^RD\$\s?/, '') : valor;
}
