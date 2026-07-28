/**
 * Validación y saneamiento de entrada.
 *
 * Regla general: los formularios sanean al escribir (para que el usuario no
 * pueda teclear basura) y validan al enviar (para dar un mensaje claro).
 * El servidor vuelve a validar todo — esto es comodidad, no seguridad.
 */

export interface Resultado {
  valido: boolean;
  mensaje?: string;
}

export const OK: Resultado = { valido: true };
const error = (mensaje: string): Resultado => ({ valido: false, mensaje });

// =====================================================================
// Texto
// =====================================================================

/**
 * Normaliza texto libre: recorta, colapsa espacios repetidos y elimina
 * caracteres de control invisibles que se cuelan al pegar desde Word o PDF.
 *
 * No intenta "escapar HTML": React ya escapa por defecto. Confiar en un
 * reemplazo de `<` y `>` daba una falsa sensación de seguridad y además
 * destruía texto legítimo.
 */
export function limpiarTexto(valor: string | null | undefined, maxLongitud = 500): string {
  if (!valor) return '';
  return String(valor)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLongitud);
}

/** Texto multilínea: conserva los saltos de línea pero limpia el resto. */
export function limpiarTextoMultilinea(valor: string | null | undefined, maxLongitud = 2000): string {
  if (!valor) return '';
  return String(valor)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLongitud);
}

const RE_NOMBRE = /^[\p{L}\p{M}0-9 .,&'’\-/()]+$/u;

/** Nombres de persona o empresa: letras (con acentos y ñ), dígitos y puntuación comercial. */
export function validarNombre(valor: string, etiqueta = 'El nombre'): Resultado {
  const v = limpiarTexto(valor, 160);
  if (v.length === 0) return error(`${etiqueta} es obligatorio.`);
  if (v.length < 2) return error(`${etiqueta} debe tener al menos 2 caracteres.`);
  if (v.length > 160) return error(`${etiqueta} no puede pasar de 160 caracteres.`);
  if (!RE_NOMBRE.test(v)) return error(`${etiqueta} contiene caracteres no permitidos.`);
  return OK;
}

/** Elimina todo lo que no sea dígito. Base de cédulas, RNC y teléfonos. */
export function soloDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

// =====================================================================
// Documentos dominicanos
// =====================================================================

/**
 * Cédula de identidad y electoral: 11 dígitos con dígito verificador
 * calculado por el algoritmo de Luhn (pesos 1,2 alternos).
 */
export function validarCedula(valor: string): Resultado {
  const d = soloDigitos(valor);
  if (d.length === 0) return error('La cédula es obligatoria.');
  if (d.length !== 11) return error('La cédula debe tener 11 dígitos.');
  if (/^(\d)\1{10}$/.test(d)) return error('La cédula no es válida.');

  let suma = 0;
  for (let i = 0; i < 10; i++) {
    let producto = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
    if (producto > 9) producto -= 9;
    suma += producto;
  }
  const verificador = (10 - (suma % 10)) % 10;

  if (verificador !== Number(d[10])) {
    return error('La cédula no es válida (dígito verificador incorrecto).');
  }
  return OK;
}

/**
 * RNC: 9 dígitos con verificador de módulo 11 y pesos 7,9,8,6,5,4,3,2.
 */
export function validarRNC(valor: string): Resultado {
  const d = soloDigitos(valor);
  if (d.length === 0) return error('El RNC es obligatorio.');
  if (d.length !== 9) return error('El RNC debe tener 9 dígitos.');
  if (/^(\d)\1{8}$/.test(d)) return error('El RNC no es válido.');

  const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, peso, i) => acc + peso * Number(d[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 2 : resto === 1 ? 1 : 11 - resto;

  if (verificador !== Number(d[8])) {
    return error('El RNC no es válido (dígito verificador incorrecto).');
  }
  return OK;
}

/**
 * Acepta cédula (11 dígitos) o RNC (9 dígitos), según la longitud.
 * Campo opcional: vacío es válido.
 */
export function validarDocumento(valor: string, obligatorio = false): Resultado {
  const d = soloDigitos(valor);
  if (d.length === 0) {
    return obligatorio ? error('El RNC o cédula es obligatorio.') : OK;
  }
  if (d.length === 9) return validarRNC(d);
  if (d.length === 11) return validarCedula(d);
  return error('Debe ser un RNC (9 dígitos) o una cédula (11 dígitos).');
}

/** Formatea para mostrar: 001-0000000-0 (cédula) o 1-30-00000-0 (RNC). */
export function formatearDocumento(valor: string | null | undefined): string {
  const d = soloDigitos(valor);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
  if (d.length === 9) return `${d.slice(0, 1)}-${d.slice(1, 3)}-${d.slice(3, 8)}-${d.slice(8)}`;
  return valor ?? '';
}

// =====================================================================
// Teléfono
// =====================================================================

const CODIGOS_AREA_RD = ['809', '829', '849'];

/**
 * Teléfono dominicano: 10 dígitos con código de área válido, o el mismo
 * número con el prefijo país 1. Campo opcional.
 */
export function validarTelefono(valor: string, obligatorio = false): Resultado {
  let d = soloDigitos(valor);
  if (d.length === 0) {
    return obligatorio ? error('El teléfono es obligatorio.') : OK;
  }
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10) return error('El teléfono debe tener 10 dígitos.');
  if (!CODIGOS_AREA_RD.includes(d.slice(0, 3))) {
    return error('El código de área debe ser 809, 829 u 849.');
  }
  return OK;
}

export function formatearTelefono(valor: string | null | undefined): string {
  let d = soloDigitos(valor);
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return valor ?? '';
}

/** Normaliza a formato internacional para los enlaces de WhatsApp. */
export function telefonoParaWhatsapp(valor: string | null | undefined): string {
  const d = soloDigitos(valor);
  if (d.length === 11 && d.startsWith('1')) return d;
  if (d.length === 10) return `1${d}`;
  return d;
}

// =====================================================================
// Correo electrónico
// =====================================================================

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export function validarEmail(valor: string, obligatorio = false): Resultado {
  const v = limpiarTexto(valor, 254).toLowerCase();
  if (v.length === 0) {
    return obligatorio ? error('El correo es obligatorio.') : OK;
  }
  if (!RE_EMAIL.test(v)) return error('El correo no tiene un formato válido.');
  return OK;
}

// =====================================================================
// Números y dinero
// =====================================================================

/**
 * Convierte a número de forma segura. Devuelve `null` si no es un número
 * finito — nunca `NaN`, que se propaga en silencio por los cálculos y acaba
 * mostrando "RD$ NaN" al usuario.
 */
export function aNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Redondeo monetario estable a 2 decimales. */
export function redondearDinero(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Sanea un campo numérico al escribir: descarta lo que no sea número,
 * aplica límites y recorta decimales.
 */
export function sanearNumero(
  valor: unknown,
  opciones: { min?: number; max?: number; decimales?: number; porDefecto?: number } = {}
): number {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, decimales = 2, porDefecto = 0 } = opciones;
  const n = aNumero(valor);
  if (n === null) return porDefecto;
  const acotado = Math.min(Math.max(n, min), max);
  const factor = 10 ** decimales;
  return Math.round((acotado + Number.EPSILON) * factor) / factor;
}

export function validarMonto(
  valor: unknown,
  etiqueta = 'El monto',
  opciones: { min?: number; max?: number; permitirCero?: boolean } = {}
): Resultado {
  const { min = 0, max = 999_999_999, permitirCero = false } = opciones;
  if (valor === null || valor === undefined || valor === '') {
    return error(`${etiqueta} es obligatorio.`);
  }
  const n = aNumero(valor);
  if (n === null) return error(`${etiqueta} debe ser un número.`);
  if (!permitirCero && n <= 0) return error(`${etiqueta} debe ser mayor que cero.`);
  if (n < min) return error(`${etiqueta} no puede ser menor que ${min}.`);
  if (n > max) return error(`${etiqueta} supera el máximo permitido.`);
  return OK;
}

export function validarCantidad(valor: unknown, etiqueta = 'La cantidad'): Resultado {
  const n = aNumero(valor);
  if (n === null) return error(`${etiqueta} debe ser un número.`);
  if (n <= 0) return error(`${etiqueta} debe ser mayor que cero.`);
  if (n > 100_000) return error(`${etiqueta} supera el máximo permitido.`);
  return OK;
}

export function validarPorcentaje(valor: unknown, etiqueta = 'El porcentaje', max = 100): Resultado {
  const n = aNumero(valor);
  if (n === null) return error(`${etiqueta} debe ser un número.`);
  if (n < 0) return error(`${etiqueta} no puede ser negativo.`);
  if (n > max) return error(`${etiqueta} no puede pasar de ${max}%.`);
  return OK;
}

export function validarEntero(
  valor: unknown,
  etiqueta: string,
  min: number,
  max: number
): Resultado {
  const n = aNumero(valor);
  if (n === null || !Number.isInteger(n)) return error(`${etiqueta} debe ser un número entero.`);
  if (n < min || n > max) return error(`${etiqueta} debe estar entre ${min} y ${max}.`);
  return OK;
}

// =====================================================================
// Fechas
// =====================================================================

export function validarFecha(valor: string, etiqueta = 'La fecha'): Resultado {
  if (!valor) return error(`${etiqueta} es obligatoria.`);
  const partes = valor.split('-');
  if (partes.length !== 3) return error(`${etiqueta} no tiene un formato válido.`);

  const [anio, mes, dia] = partes.map(Number);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) {
    return error(`${etiqueta} no tiene un formato válido.`);
  }
  if (anio < 2000 || anio > 2100) return error(`${etiqueta} debe estar entre los años 2000 y 2100.`);

  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return error(`${etiqueta} no existe en el calendario.`);
  }
  return OK;
}

// =====================================================================
// NCF (Número de Comprobante Fiscal)
// =====================================================================

const TIPOS_NCF: Record<string, string> = {
  '01': 'Crédito fiscal',
  '02': 'Consumo',
  '03': 'Nota de débito',
  '04': 'Nota de crédito',
  '11': 'Régimen especial',
  '12': 'Gubernamental',
  '13': 'Gastos menores',
  '14': 'Regímenes especiales',
  '15': 'Gubernamental',
  '16': 'Exportaciones',
  '17': 'Pagos al exterior',
};

/** Formato B/E + 2 dígitos de tipo + 8 de secuencia. Campo opcional. */
export function validarNCF(valor: string, obligatorio = false): Resultado {
  const v = limpiarTexto(valor, 13).toUpperCase().replace(/\s/g, '');
  if (v.length === 0) {
    return obligatorio ? error('El NCF es obligatorio.') : OK;
  }
  if (!/^[BE]\d{10}$/.test(v)) {
    return error('El NCF debe ser una letra B o E seguida de 10 dígitos (ej. B0100000123).');
  }
  const tipo = v.slice(1, 3);
  if (!TIPOS_NCF[tipo]) {
    return error(`El tipo de NCF "${tipo}" no es un tipo reconocido por la DGII.`);
  }
  return OK;
}

export function describirNCF(valor: string | null | undefined): string | null {
  const v = (valor ?? '').toUpperCase().replace(/\s/g, '');
  if (!/^[BE]\d{10}$/.test(v)) return null;
  return TIPOS_NCF[v.slice(1, 3)] ?? null;
}

// =====================================================================
// Utilidad para formularios
// =====================================================================

/** Devuelve el primer mensaje de error, o `null` si todo está bien. */
export function primerError(...resultados: Resultado[]): string | null {
  for (const r of resultados) {
    if (!r.valido) return r.mensaje ?? 'Dato inválido.';
  }
  return null;
}
