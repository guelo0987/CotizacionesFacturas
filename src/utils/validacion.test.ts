import { describe, expect, it } from 'vitest';
import {
  aNumero,
  formatearDocumento,
  formatearTelefono,
  limpiarTexto,
  limpiarTextoMultilinea,
  redondearDinero,
  sanearNumero,
  soloDigitos,
  telefonoParaWhatsapp,
  validarCantidad,
  validarCedula,
  validarDocumento,
  validarEmail,
  validarEntero,
  validarFecha,
  validarMonto,
  validarNCF,
  validarNombre,
  validarPorcentaje,
  validarRNC,
  validarTelefono,
} from './validacion';

/**
 * Cédulas y RNC calculados con el propio algoritmo de verificación,
 * no tomados de personas reales.
 */
const CEDULA_VALIDA = '00112345673';
const RNC_VALIDO = '130000001';

describe('limpiarTexto', () => {
  it('recorta y colapsa espacios', () => {
    expect(limpiarTexto('   Juan    Pérez  ')).toBe('Juan Pérez');
  });

  it('elimina caracteres de control invisibles', () => {
    expect(limpiarTexto('Ju\u0000a\u001Fn')).toBe('Juan');
  });

  it('respeta la longitud máxima', () => {
    expect(limpiarTexto('a'.repeat(300), 10)).toHaveLength(10);
  });

  it('devuelve cadena vacía ante nulo', () => {
    expect(limpiarTexto(null)).toBe('');
    expect(limpiarTexto(undefined)).toBe('');
  });

  it('no destruye texto legítimo con signos', () => {
    expect(limpiarTexto('Descuento 2 x 3 <ver nota>')).toBe('Descuento 2 x 3 <ver nota>');
  });
});

describe('limpiarTextoMultilinea', () => {
  it('conserva los saltos de línea', () => {
    expect(limpiarTextoMultilinea('línea uno\nlínea dos')).toBe('línea uno\nlínea dos');
  });

  it('reduce más de dos saltos seguidos', () => {
    expect(limpiarTextoMultilinea('a\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('validarNombre', () => {
  it('acepta nombres con tildes y ñ', () => {
    expect(validarNombre('Muñoz Peña').valido).toBe(true);
  });

  it('acepta nombres comerciales con puntuación', () => {
    expect(validarNombre("Colmado D'Angelo & Hnos. (Sucursal 2)").valido).toBe(true);
  });

  it('rechaza vacío', () => {
    expect(validarNombre('').valido).toBe(false);
  });

  it('rechaza un solo carácter', () => {
    expect(validarNombre('A').valido).toBe(false);
  });

  it('rechaza caracteres no permitidos', () => {
    expect(validarNombre('Juan <script>').valido).toBe(false);
  });
});

describe('validarCedula', () => {
  it('acepta una cédula con verificador correcto', () => {
    expect(validarCedula(CEDULA_VALIDA).valido).toBe(true);
  });

  it('acepta la cédula con guiones', () => {
    expect(validarCedula('001-1234567-3').valido).toBe(true);
  });

  it('rechaza el verificador incorrecto', () => {
    expect(validarCedula('00112345670').valido).toBe(false);
  });

  it('rechaza longitud distinta de 11', () => {
    expect(validarCedula('001123456').valido).toBe(false);
  });

  it('rechaza todos los dígitos iguales', () => {
    expect(validarCedula('11111111111').valido).toBe(false);
  });
});

describe('validarRNC', () => {
  it('acepta un RNC con verificador correcto', () => {
    expect(validarRNC(RNC_VALIDO).valido).toBe(true);
  });

  it('rechaza el verificador incorrecto', () => {
    expect(validarRNC('130000009').valido).toBe(false);
  });

  it('rechaza longitud distinta de 9', () => {
    expect(validarRNC('13000000').valido).toBe(false);
  });
});

describe('validarDocumento', () => {
  it('detecta cédula por longitud', () => {
    expect(validarDocumento(CEDULA_VALIDA).valido).toBe(true);
  });

  it('detecta RNC por longitud', () => {
    expect(validarDocumento(RNC_VALIDO).valido).toBe(true);
  });

  it('acepta vacío cuando es opcional', () => {
    expect(validarDocumento('').valido).toBe(true);
  });

  it('rechaza vacío cuando es obligatorio', () => {
    expect(validarDocumento('', true).valido).toBe(false);
  });

  it('rechaza longitudes intermedias', () => {
    expect(validarDocumento('1234567890').valido).toBe(false);
  });
});

describe('formatearDocumento', () => {
  it('formatea una cédula', () => {
    expect(formatearDocumento(CEDULA_VALIDA)).toBe('001-1234567-3');
  });

  it('formatea un RNC', () => {
    expect(formatearDocumento(RNC_VALIDO)).toBe('1-30-00000-1');
  });

  it('devuelve el original si no reconoce la longitud', () => {
    expect(formatearDocumento('123')).toBe('123');
  });
});

describe('validarTelefono', () => {
  it.each(['8091234567', '8291234567', '8491234567'])('acepta el código de área %s', (tel) => {
    expect(validarTelefono(tel).valido).toBe(true);
  });

  it('acepta el prefijo de país 1', () => {
    expect(validarTelefono('18091234567').valido).toBe(true);
  });

  it('acepta formato con paréntesis y guiones', () => {
    expect(validarTelefono('(809) 123-4567').valido).toBe(true);
  });

  it('rechaza un código de área que no es dominicano', () => {
    expect(validarTelefono('2121234567').valido).toBe(false);
  });

  it('rechaza longitud incorrecta', () => {
    expect(validarTelefono('80912345').valido).toBe(false);
  });

  it('acepta vacío cuando es opcional', () => {
    expect(validarTelefono('').valido).toBe(true);
  });
});

describe('telefonoParaWhatsapp', () => {
  it('antepone el 1 a un número de 10 dígitos', () => {
    expect(telefonoParaWhatsapp('8091234567')).toBe('18091234567');
  });

  it('no duplica el prefijo si ya está', () => {
    expect(telefonoParaWhatsapp('18091234567')).toBe('18091234567');
  });
});

describe('formatearTelefono', () => {
  it('formatea 10 dígitos', () => {
    expect(formatearTelefono('8091234567')).toBe('(809) 123-4567');
  });
});

describe('validarEmail', () => {
  it.each(['a@b.do', 'juan.perez@negocio.com.do'])('acepta %s', (email) => {
    expect(validarEmail(email).valido).toBe(true);
  });

  it.each(['sinarroba', 'a@b', 'a@@b.com', 'a b@c.com'])('rechaza %s', (email) => {
    expect(validarEmail(email).valido).toBe(false);
  });

  it('acepta vacío cuando es opcional', () => {
    expect(validarEmail('').valido).toBe(true);
  });
});

describe('aNumero', () => {
  it('convierte cadenas numéricas', () => {
    expect(aNumero('1250.50')).toBe(1250.5);
  });

  it('ignora separadores de miles', () => {
    expect(aNumero('1,250.50')).toBe(1250.5);
  });

  it('devuelve null en vez de NaN', () => {
    expect(aNumero('abc')).toBeNull();
    expect(aNumero('')).toBeNull();
    expect(aNumero(null)).toBeNull();
    expect(aNumero(Infinity)).toBeNull();
  });
});

describe('redondearDinero', () => {
  it('redondea a dos decimales', () => {
    expect(redondearDinero(10.005)).toBe(10.01);
    expect(redondearDinero(1.005)).toBe(1.01);
  });

  it('resuelve el clásico 0.1 + 0.2', () => {
    expect(redondearDinero(0.1 + 0.2)).toBe(0.3);
  });

  it('mantiene los enteros', () => {
    expect(redondearDinero(1000)).toBe(1000);
  });
});

describe('sanearNumero', () => {
  it('acota al mínimo', () => {
    expect(sanearNumero(-50, { min: 0 })).toBe(0);
  });

  it('acota al máximo', () => {
    expect(sanearNumero(500, { min: 0, max: 100 })).toBe(100);
  });

  it('devuelve el valor por defecto ante entrada inválida', () => {
    expect(sanearNumero('abc', { porDefecto: 18 })).toBe(18);
  });

  it('recorta decimales', () => {
    expect(sanearNumero(3.14159, { decimales: 2 })).toBe(3.14);
    expect(sanearNumero(3.7, { decimales: 0 })).toBe(4);
  });
});

describe('validarMonto', () => {
  it('rechaza cero por defecto', () => {
    expect(validarMonto(0).valido).toBe(false);
  });

  it('acepta cero cuando se permite', () => {
    expect(validarMonto(0, 'El precio', { permitirCero: true }).valido).toBe(true);
  });

  it('rechaza negativos', () => {
    expect(validarMonto(-1).valido).toBe(false);
  });

  it('rechaza texto', () => {
    expect(validarMonto('mucho dinero').valido).toBe(false);
  });
});

describe('validarCantidad', () => {
  it('acepta decimales positivos', () => {
    expect(validarCantidad(2.5).valido).toBe(true);
  });

  it('rechaza cero y negativos', () => {
    expect(validarCantidad(0).valido).toBe(false);
    expect(validarCantidad(-3).valido).toBe(false);
  });
});

describe('validarPorcentaje', () => {
  it('acepta el rango 0–100', () => {
    expect(validarPorcentaje(0).valido).toBe(true);
    expect(validarPorcentaje(18).valido).toBe(true);
    expect(validarPorcentaje(100).valido).toBe(true);
  });

  it('rechaza fuera de rango', () => {
    expect(validarPorcentaje(-1).valido).toBe(false);
    expect(validarPorcentaje(101).valido).toBe(false);
  });

  it('respeta un máximo personalizado', () => {
    expect(validarPorcentaje(60, 'ITBIS', 50).valido).toBe(false);
  });
});

describe('validarEntero', () => {
  it('acepta enteros dentro del rango', () => {
    expect(validarEntero(12, 'Cuotas', 1, 120).valido).toBe(true);
  });

  it('rechaza decimales', () => {
    expect(validarEntero(2.5, 'Cuotas', 1, 120).valido).toBe(false);
  });

  it('rechaza fuera de rango', () => {
    expect(validarEntero(200, 'Cuotas', 1, 120).valido).toBe(false);
  });
});

describe('validarFecha', () => {
  it('acepta una fecha válida', () => {
    expect(validarFecha('2026-07-28').valido).toBe(true);
  });

  it('rechaza el 31 de febrero', () => {
    expect(validarFecha('2026-02-31').valido).toBe(false);
  });

  it('acepta el 29 de febrero en año bisiesto', () => {
    expect(validarFecha('2028-02-29').valido).toBe(true);
  });

  it('rechaza el 29 de febrero en año no bisiesto', () => {
    expect(validarFecha('2026-02-29').valido).toBe(false);
  });

  it('rechaza vacío y formatos raros', () => {
    expect(validarFecha('').valido).toBe(false);
    expect(validarFecha('28/07/2026').valido).toBe(false);
  });
});

describe('validarNCF', () => {
  it('acepta un NCF de crédito fiscal', () => {
    expect(validarNCF('B0100000123').valido).toBe(true);
  });

  it('acepta un NCF de consumo', () => {
    expect(validarNCF('B0200000001').valido).toBe(true);
  });

  it('rechaza un tipo inexistente', () => {
    expect(validarNCF('B9900000001').valido).toBe(false);
  });

  it('rechaza una longitud incorrecta', () => {
    expect(validarNCF('B010000012').valido).toBe(false);
  });

  it('rechaza una letra inicial inválida', () => {
    expect(validarNCF('X0100000123').valido).toBe(false);
  });

  it('acepta vacío cuando es opcional', () => {
    expect(validarNCF('').valido).toBe(true);
  });
});

describe('soloDigitos', () => {
  it('elimina todo lo que no sea dígito', () => {
    expect(soloDigitos('(809) 123-4567')).toBe('8091234567');
    expect(soloDigitos(null)).toBe('');
  });
});
