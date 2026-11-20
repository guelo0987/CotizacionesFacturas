/**
 * Reducción de fotos antes de subirlas.
 *
 * La cámara de un teléfono saca fotos de 3 a 8 MB. Para leer una cédula
 * bastan 1600 px por el lado largo: en JPEG eso queda en unos 200–400 KB,
 * sube rápido con datos móviles y no llena el almacenamiento.
 */

export const LADO_MAXIMO = 1600;
export const CALIDAD_JPEG = 0.82;

/** Medidas que caben en `maximo` sin deformar la imagen ni agrandarla. */
export function medidasReducidas(ancho: number, alto: number, maximo = LADO_MAXIMO) {
  if (!(ancho > 0) || !(alto > 0)) return { ancho: 0, alto: 0 };
  const escala = Math.min(1, maximo / Math.max(ancho, alto));
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

const ERROR_LECTURA = 'No se pudo leer la imagen. Usa una foto en JPG o PNG.';

/** Abre la imagen respetando la orientación con la que se tomó. */
async function abrirImagen(archivo: Blob): Promise<{ fuente: CanvasImageSource; ancho: number; alto: number; cerrar: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      return { fuente: bitmap, ancho: bitmap.width, alto: bitmap.height, cerrar: () => bitmap.close() };
    } catch {
      // Algunos navegadores no aceptan opciones: se prueba con <img>
    }
  }

  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight, cerrar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(ERROR_LECTURA);
  }
}

/** Devuelve la foto como JPEG de 1600 px como mucho. */
export async function reducirFoto(archivo: File, maximo = LADO_MAXIMO, calidad = CALIDAD_JPEG): Promise<Blob> {
  if (archivo.type && !archivo.type.startsWith('image/')) {
    throw new Error('Ese archivo no es una imagen.');
  }

  const imagen = await abrirImagen(archivo);
  try {
    const { ancho, alto } = medidasReducidas(imagen.ancho, imagen.alto, maximo);
    if (!ancho || !alto) throw new Error(ERROR_LECTURA);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error(ERROR_LECTURA);
    // Fondo blanco: una PNG con transparencia no queda negra en JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(imagen.fuente, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, 'image/jpeg', calidad));
    if (!blob) throw new Error(ERROR_LECTURA);
    return blob;
  } finally {
    imagen.cerrar();
  }
}
