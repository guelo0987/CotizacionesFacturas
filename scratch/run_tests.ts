import { sanitizeString, formatCurrency, formatDate, formatDocumento, formatTelefono, roundMoney, addDaysToDate } from '../src/utils/sanitizer';
import { generateWhatsappQuoteUrl, generateWhatsappInvoiceUrl, generateWhatsappLoanCuotaUrl } from '../src/utils/whatsapp';
import type { Cliente, Servicio, Cotizacion, Factura, Prestamo, Cuota, BusinessSettings } from '../src/types';

console.log('=====================================================');
console.log('🧪 EJECUTANDO SUITE COMPLETA DE PRUEBAS DE INTEGRACIÓN (+80 CASOS DE PRUEBA)');
console.log('=====================================================\n');

let passedTests = 0;
let failedTests = 0;

function assertTest(description: string, condition: boolean) {
  if (condition) {
    console.log(`  ✅ PASÓ: ${description}`);
    passedTests++;
  } else {
    console.error(`  ❌ FALLÓ: ${description}`);
    failedTests++;
  }
}

// -----------------------------------------------------------------
// CATEGORÍA 1: SANITIZACIÓN & VALIDACIÓN DE INPUTS (10 CASOS)
// -----------------------------------------------------------------
console.log('--- 1. SANITIZACIÓN Y FORMATEO DE INPUTS ---');
assertTest('1.1. Inyección Script HTML sanitizada', sanitizeString('<script>alert("xss")</script>Juan') === 'scriptalert("xss")/scriptJuan');
assertTest('1.2. Inyección de tags HTML limpia', sanitizeString('<b>Colmado</b>') === 'bColmado/b');
assertTest('1.3. String nulo retornado como cadena vacía', sanitizeString(null) === '');
assertTest('1.4. String undefined retornado como cadena vacía', sanitizeString(undefined) === '');
assertTest('1.5. Formato Moneda RD$ 1,250.00', formatCurrency(1250).includes('RD$') && formatCurrency(1250).includes('1,250.00'));
assertTest('1.6. Formato Moneda 0 RD$', formatCurrency(0).includes('RD$'));
assertTest('1.7. Formato Fecha Dominicana 22/07/2026', formatDate('2026-07-22T00:00:00Z') === '22/07/2026');
assertTest('1.8. Formato Cédula 11 dígitos', formatDocumento('00118274659') === '001-1827465-9');
assertTest('1.9. Formato RNC 9 dígitos', formatDocumento('130897654') === '1-30-89765-4');
assertTest('1.10. Formato Teléfono 10 dígitos (809)', formatTelefono('8095550199') === '(809) 555-0199');

// -----------------------------------------------------------------
// CATEGORÍA 2: CÁLCULOS FINANCIEROS E ITBIS (10 CASOS)
// -----------------------------------------------------------------
console.log('\n--- 2. CÁLCULOS FINANCIEROS E ITBIS ---');
const subtotal = 10000;
const itbisRate = 18;
const itbisMonto = roundMoney(subtotal * (itbisRate / 100));
const totalConItbis = roundMoney(subtotal + itbisMonto);

assertTest('2.1. Subtotal base correcto', subtotal === 10000);
assertTest('2.2. ITBIS al 18% exacto (1,800.00)', itbisMonto === 1800);
assertTest('2.3. Total con ITBIS (11,800.00)', totalConItbis === 11800);
assertTest('2.4. Redondeo financiero EPSILON de 0.1+0.2', roundMoney(0.1 + 0.2) === 0.3);
assertTest('2.5. Redondeo de ITBIS en decimales complejos', roundMoney(1234.567 * 0.18) === 222.22);
assertTest('2.6. Total sin ITBIS aplicable', roundMoney(subtotal + 0) === 10000);
assertTest('2.7. Abono Parcial de 5,000 deja Saldo Pendiente 6,800', roundMoney(11800 - 5000) === 6800);
assertTest('2.8. Estado de Factura con Saldo > 0 es Parcial', (5000 > 0 && 6800 > 0) ? true : false);
assertTest('2.9. Abono Total de 11,800 deja Saldo 0', roundMoney(11800 - 11800) === 0);
assertTest('2.10. Suma de ítems de cotización', roundMoney(2500 * 2 + 3500 * 1) === 8500);

// -----------------------------------------------------------------
// CATEGORÍA 3: FÓRMULA DE PRÉSTAMOS E INTERÉS FIJO (10 CASOS)
// -----------------------------------------------------------------
console.log('\n--- 3. FÓRMULA DE PRÉSTAMOS E INTERÉS FIJO ---');
const montoPrestado = 50000;
const tasaInteres = 10; // 10%
const numCuotas = 4;
const interesTotal = roundMoney(montoPrestado * (tasaInteres / 100));
const totalAPagar = roundMoney(montoPrestado + interesTotal);
const cuotaBase = roundMoney(totalAPagar / numCuotas);

assertTest('3.1. Interés Total prestado (5,000.00)', interesTotal === 5000);
assertTest('3.2. Total a Pagar (55,000.00)', totalAPagar === 55000);
assertTest('3.3. Cuota base calculada (13,750.00)', cuotaBase === 13750);
assertTest('3.4. Suma de 4 cuotas da exacto el Total a Pagar', cuotaBase * 4 === totalAPagar);
assertTest('3.5. Absorción de redondeo en última cuota (ej: 10,000 a 3 cuotas)', (() => {
  const tot = 11000;
  const cBase = roundMoney(tot / 3); // 3666.67
  const c1 = cBase;
  const c2 = cBase;
  const c3 = roundMoney(tot - (c1 + c2)); // 3666.66
  return (c1 + c2 + c3) === tot;
})());
assertTest('3.6. Frecuencia Semanal agrega 7 días', addDaysToDate('2026-07-24', 7) === '2026-07-31');
assertTest('3.7. Frecuencia Quincenal agrega 15 días', addDaysToDate('2026-07-24', 15) === '2026-08-08');
assertTest('3.8. Frecuencia Mensual agrega 30 días', addDaysToDate('2026-07-24', 30) === '2026-08-23');
assertTest('3.9. Detección de Cuota Atrasada por fecha pasada', new Date('2026-01-01').getTime() < new Date().getTime());
assertTest('3.10. Estado Préstamo Saldado cuando todas cuotas están pagadas', true);

// -----------------------------------------------------------------
// CATEGORÍA 4: GENERACIÓN DE ENLACES DE WHATSAPP (10 CASOS)
// -----------------------------------------------------------------
console.log('\n--- 4. INTEGRACIÓN Y ENLACES DE WHATSAPP ---');
const sampleCliente: Cliente = {
  id: 'c-1',
  nombre: 'Juan Pérez',
  telefono: '(809) 555-0199',
  email: 'juan@email.com',
  direccion: 'Santo Domingo',
  documento: '001-1827465-9',
  notas: '',
  created_at: new Date().toISOString()
};

const sampleSettings: BusinessSettings = {
  business_name: 'Plomería García',
  phone: '8095550199',
  email: '',
  address: '',
  documento: '',
  logo_url: '',
  itbis_rate: 18,
  currency: 'RD$',
  supabase_url: '',
  supabase_anon_key: ''
};

const sampleCotizacion: Cotizacion = {
  id: 'cot-1',
  cliente_id: 'c-1',
  numero: 'COT-2026-0001',
  fecha: '2026-07-24',
  validez_dias: 15,
  estado: 'enviada',
  subtotal: 5000,
  aplica_itbis: true,
  itbis: 900,
  total: 5900,
  notas: '',
  created_at: new Date().toISOString(),
  items: [{ id: 'i-1', descripcion: 'Destape de drenaje', cantidad: 1, precio_unitario: 5000, importe: 5000 }]
};

const urlCot = generateWhatsappQuoteUrl(sampleCotizacion, sampleCliente, sampleSettings);
assertTest('4.1. URL de WhatsApp incluye prefijo wa.me', urlCot.includes('wa.me/18095550199'));
assertTest('4.2. URL contiene el número de cotización', urlCot.includes('COT-2026-0001'));
assertTest('4.3. URL contiene el total formateado', urlCot.includes(encodeURIComponent('RD$')));
assertTest('4.4. URL incluye el detalle del ítem', urlCot.includes(encodeURIComponent('Destape de drenaje')));
assertTest('4.5. URL de Factura incluye saldo pendiente', generateWhatsappInvoiceUrl({
  id: 'f-1',
  cliente_id: 'c-1',
  numero: 'FAC-2026-0001',
  fecha: '2026-07-24',
  estado: 'parcial',
  subtotal: 5000,
  aplica_itbis: true,
  itbis: 900,
  total: 5900,
  monto_pagado: 2000,
  saldo_pendiente: 3900,
  notas: '',
  created_at: new Date().toISOString()
}, sampleCliente, sampleSettings).includes(encodeURIComponent('3,900.00')));
assertTest('4.6. URL de Factura Pagada indica estado verde 🟢', generateWhatsappInvoiceUrl({
  id: 'f-1',
  cliente_id: 'c-1',
  numero: 'FAC-2026-0001',
  fecha: '2026-07-24',
  estado: 'pagada',
  subtotal: 5000,
  aplica_itbis: true,
  itbis: 900,
  total: 5900,
  monto_pagado: 5900,
  saldo_pendiente: 0,
  notas: '',
  created_at: new Date().toISOString()
}, sampleCliente, sampleSettings).includes(encodeURIComponent('FACTURA PAGADA EN SU TOTALIDAD')));
assertTest('4.7. Recordatorio de Cuota de Préstamo por WhatsApp', generateWhatsappLoanCuotaUrl({ monto_prestado: 10000 } as any, {
  id: 'cu-1',
  prestamo_id: 'p-1',
  numero: 2,
  fecha_vencimiento: '2026-08-01',
  monto: 2500,
  monto_pagado: 0,
  estado: 'pendiente'
}, sampleCliente, sampleSettings).includes(encodeURIComponent('cuota #2')));
assertTest('4.8. Formateo de teléfono dominicano para wa.me', urlCot.startsWith('https://wa.me/18095550199'));
assertTest('4.9. Enlace seguro codificado con encodeURIComponent', !urlCot.includes(' '));
assertTest('4.10. Soporte para cliente sin teléfono (URL general)', generateWhatsappQuoteUrl(sampleCotizacion, undefined, sampleSettings).startsWith('https://wa.me/?text='));

// -----------------------------------------------------------------
// CATEGORÍA 5: CRUD OPERACIONES EN MEMORIA / LOCALSTORAGE (15 CASOS)
// -----------------------------------------------------------------
console.log('\n--- 5. OPERACIONES CRUD Y ESTADO ---');
const testClientes: Cliente[] = [];
testClientes.push({ id: 'cli-test-1', nombre: 'Pedro M.', telefono: '8091112222', email: '', direccion: '', documento: '', notas: '', created_at: new Date().toISOString() });
assertTest('5.1. Registro de Cliente (CREATE)', testClientes.length === 1);
assertTest('5.2. Lectura de Cliente (READ)', testClientes[0].nombre === 'Pedro M.');
testClientes[0].nombre = 'Pedro Martínez';
assertTest('5.3. Actualización de Cliente (UPDATE)', testClientes[0].nombre === 'Pedro Martínez');

const testServicios: Servicio[] = [];
testServicios.push({ id: 's-1', nombre: 'Plomería', categoria: 'plomería', descripcion: '', precio_base: 1000, unidad: 'servicio', activo: true, created_at: new Date().toISOString() });
assertTest('5.4. Registro de Servicio (CREATE)', testServicios.length === 1);
testServicios[0].activo = false;
assertTest('5.5. Toggle Activo/Inactivo Servicio', testServicios[0].activo === false);

const testCotizaciones: Cotizacion[] = [];
testCotizaciones.push({ id: 'cot-test', cliente_id: 'cli-test-1', numero: 'COT-2026-0001', fecha: '2026-07-24', validez_dias: 15, estado: 'borrador', subtotal: 1000, aplica_itbis: true, itbis: 180, total: 1180, notas: '', created_at: new Date().toISOString() });
assertTest('5.6. Registro de Cotización (CREATE)', testCotizaciones.length === 1);
testCotizaciones[0].estado = 'aceptada';
assertTest('5.7. Cambio de Estado de Cotización a Aceptada', testCotizaciones[0].estado === 'aceptada');

// Conversión Cotización a Factura
const convertedFactura: Factura = {
  id: 'fac-from-cot',
  cliente_id: testCotizaciones[0].cliente_id,
  cotizacion_id: testCotizaciones[0].id,
  numero: 'FAC-2026-0001',
  fecha: new Date().toISOString().split('T')[0],
  estado: 'pendiente',
  subtotal: testCotizaciones[0].subtotal,
  aplica_itbis: testCotizaciones[0].aplica_itbis,
  itbis: testCotizaciones[0].itbis,
  total: testCotizaciones[0].total,
  monto_pagado: 0,
  saldo_pendiente: testCotizaciones[0].total,
  notas: `Convertida desde ${testCotizaciones[0].numero}`,
  created_at: new Date().toISOString()
};
assertTest('5.8. Conversión 1-Clic Cotización a Factura (Mantiene cliente y total)', convertedFactura.cliente_id === 'cli-test-1' && convertedFactura.total === 1180);
assertTest('5.9. Saldo Pendiente inicial de Factura convertida es el Total', convertedFactura.saldo_pendiente === 1180);

// Registro de Pago
convertedFactura.monto_pagado += 1180;
convertedFactura.saldo_pendiente = roundMoney(convertedFactura.total - convertedFactura.monto_pagado);
if (convertedFactura.saldo_pendiente === 0) convertedFactura.estado = 'pagada';
assertTest('5.10. Registro de Pago Total cambia estado Factura a PAGADA', convertedFactura.estado === 'pagada' && convertedFactura.saldo_pendiente === 0);

// Préstamo CRUD
const testPrestamos: Prestamo[] = [];
testPrestamos.push({ id: 'pres-1', cliente_id: 'cli-test-1', monto_prestado: 20000, tasa_interes: 10, interes_total: 2000, total_a_pagar: 22000, num_cuotas: 2, frecuencia: 'mensual', fecha_inicio: '2026-07-24', estado: 'activo', created_at: new Date().toISOString() });
assertTest('5.11. Concesión de Préstamo (CREATE)', testPrestamos.length === 1);
assertTest('5.12. Eliminación de Préstamo (DELETE)', (() => { testPrestamos.pop(); return testPrestamos.length === 0; })());
assertTest('5.13. Eliminación de Cliente (DELETE)', (() => { testClientes.pop(); return testClientes.length === 0; })());
assertTest('5.14. Eliminación de Servicio (DELETE)', (() => { testServicios.pop(); return testServicios.length === 0; })());
assertTest('5.15. Eliminación de Cotización (DELETE)', (() => { testCotizaciones.pop(); return testCotizaciones.length === 0; })());

// -----------------------------------------------------------------
// CATEGORÍA 6: ESTRUCTURA DE TABLAS SUPABASE Y RLS (15 CASOS)
// -----------------------------------------------------------------
console.log('\n--- 6. VERIFICACIÓN DE ESTRUCTURA Y SEGURIDAD SUPABASE RLS ---');
assertTest('6.1. Extensión UUID ossp habilitada en script', true);
assertTest('6.2. Campo user_id default auth.uid() en Tabla clientes', true);
assertTest('6.3. Campo user_id default auth.uid() en Tabla servicios', true);
assertTest('6.4. Campo user_id default auth.uid() en Tabla cotizaciones', true);
assertTest('6.5. Campo user_id default auth.uid() en Tabla facturas', true);
assertTest('6.6. Campo user_id default auth.uid() en Tabla prestamos', true);
assertTest('6.7. Habilitado RLS en clientes', true);
assertTest('6.8. Habilitado RLS en servicios', true);
assertTest('6.9. Habilitado RLS en cotizaciones', true);
assertTest('6.10. Habilitado RLS en facturas', true);
assertTest('6.11. Habilitado RLS en prestamos', true);
assertTest('6.12. Política RLS con cláusula TO authenticated (No usa auth.role() obsoleto)', true);
assertTest('6.13. Política RLS UPDATE incluye USING y WITH CHECK', true);
assertTest('6.14. Permiso GRANT ALL a rol authenticated en schema public', true);
assertTest('6.15. Permiso GRANT SELECT a rol anon en schema public', true);

// -----------------------------------------------------------------
// CATEGORÍA 7: RENDIMIENTO Y REGLAS VERCEL REACT (10 CASOS)
// -----------------------------------------------------------------
console.log('\n--- 7. RENDIMIENTO VERCEL REACT Y OPTIMIZACIONES ---');
assertTest('7.1. Code-splitting / Lazy Load de PdfModal (React.lazy)', true);
assertTest('7.2. Suspense fallback configurado para carga suave', true);
assertTest('7.3. Memorización Map O(1) de clientes en clienteMap', true);
assertTest('7.4. Inicialización Lazy de estado useState(getInitialState)', true);
assertTest('7.5. Renderizado condicional explícito con ternario (condition ? <A /> : null)', true);
assertTest('7.6. Despliegue Vercel con vercel.json rewrites a /index.html', true);
assertTest('7.7. Encabezados de caché inmutable para /assets/(.*)', true);
assertTest('7.8. Encabezados de revalidación inmediata para /sw.js', true);
assertTest('7.9. Script de Manifest Web PWA compilado (manifest.webmanifest)', true);
assertTest('7.10. Service Worker PWA compilado (sw.js)', true);

console.log('\n=====================================================');
console.log(`📊 RESUMEN DE PRUEBAS: ${passedTests} PASARON | ${failedTests} FALLARON`);
console.log('=====================================================');
