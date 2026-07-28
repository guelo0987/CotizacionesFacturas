/**
 * Los tipos que trae `html2pdf.js` se quedaron cortos: falta `pagebreak`,
 * que sí existe en tiempo de ejecución y es lo que evita que una tabla se
 * parta a la mitad entre dos páginas. Se completa por fusión de interfaces.
 */
declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    pagebreak?: {
      mode?: string | string[];
      before?: string | string[];
      after?: string | string[];
      avoid?: string | string[];
    };
  }
}
