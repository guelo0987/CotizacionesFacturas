# Auditoría técnica — Sistema de Cotizaciones, Facturas y Préstamos

**Fecha:** 28 de julio de 2026
**Alcance:** todo `src/` (~5.300 líneas), `supabase/migrations/`, configuración de build y despliegue.
**Estado del build:** `tsc -b` pasa sin errores. `oxlint` reporta 8 warnings — todos señalan bugs reales de pérdida de datos (ver C3).

**Veredicto:** el sistema **no se puede vender en su estado actual**. No por acabado visual, sino porque la base de datos está abierta al público sin autenticación y porque tres flujos de datos centrales (líneas de documentos, cuotas y pagos de préstamo) no se guardan nunca. Un comprador perdería datos el primer día y su información sería accesible para cualquiera.

---

## Resumen por severidad

| Nivel | Cantidad | Naturaleza |
|---|---|---|
| Crítico | 5 | Fuga total de datos, pérdida de datos, bypass de login |
| Alto | 10 | Funcionalidad rota o ausente que el comprador nota el día 1 |
| Medio | 12 | UI rota, validación ausente, deuda técnica con impacto |
| Bajo | 6 | Código muerto e higiene |

---

## CRÍTICO — bloqueantes absolutos

### C1. La base de datos está abierta a cualquiera, sin necesidad de iniciar sesión

`supabase/migrations/20260724000000_initial_schema.sql` (final del archivo):

```sql
create policy "Permitir todo clientes" on public.clientes for all using (true) with check (true);
-- ... idéntico para las 9 tablas ...
grant all on all tables in schema public to anon, authenticated;
```

Las políticas RLS son `using (true)` — no filtran nada. Y el rol `anon` tiene `grant all` sobre todas las tablas.

La clave anónima viaja dentro del bundle JavaScript que se sirve al navegador (verificado: aparece en `dist/assets/index-D0qY77TG.js`). Eso es normal y esperado en Vite — **lo que no es normal es que esa clave dé acceso total de lectura y escritura**. Cualquier persona que abra la aplicación, saque la clave del bundle con las herramientas de desarrollo y haga una petición a la API REST de Supabase puede leer, modificar y borrar **todos los clientes, facturas y préstamos de todos los negocios**, sin autenticarse.

Las columnas `user_id` existen en las tablas pero **ninguna política las usa**. No hay aislamiento entre inquilinos de ningún tipo.

> Nota: existe un segundo esquema, `SUPABASE_SQL_SCHEMA` en `src/services/supabaseClient.ts:25-181`, con políticas algo mejores. Es una constante exportada que **nunca se importa en ningún sitio** y que además contradice a la migración real. Aun así tampoco serviría: su condición `... or user_id is null` deja abierta cualquier fila con `user_id` nulo, y conserva `grant select on all tables to anon`.

**Corrección:** reescribir las políticas para que filtren por `auth.uid() = user_id` sin escapes; `revoke all ... from anon`; hacer `user_id not null default auth.uid()`; añadir políticas a `cotizacion_items`, `factura_items`, `cuotas` y `pagos` derivando la propiedad desde su tabla padre. Borrar `SUPABASE_SQL_SCHEMA` para que quede una sola fuente de verdad.

---

### C2. Un único proyecto Supabase cableado para todos los compradores

- `src/services/store.ts:14` — `supabase_url` cae por defecto a `'https://hxeovachlapvfubcebha.supabase.co'`
- `.env.example:2` — el mismo proyecto real como ejemplo

Si vendes el sistema a diez negocios, los diez apuntan a tu base de datos. Sumado a C1, cada comprador ve y puede borrar los datos de los otros nueve.

**Corrección:** decidir el modelo comercial y aplicarlo. Si es SaaS multi-inquilino (recomendado), un solo proyecto está bien **pero exige que C1 esté resuelto de verdad**, más una tabla `organizaciones`/`perfiles` y `org_id` en cada tabla. Si es licencia por instalación, cada comprador necesita su propio proyecto Supabase y las credenciales deben salir de variables de entorno sin valor por defecto: si faltan, la app debe mostrar una pantalla de configuración, no conectarse a la tuya.

---

### C3. Las líneas de cotizaciones y facturas nunca se guardan

`src/services/supabaseDataService.ts`, líneas 94, 106, 133, 145, 172:

```ts
const { items, ...cotData } = cotizacion;   // items se descarta y nunca se inserta
const { items, pagos, ...facData } = factura;
const { cuotas, ...presData } = prestamo;
```

Las tablas `cotizacion_items`, `factura_items` y `cuotas` existen en el esquema y **jamás reciben un `insert`**. No hay ninguna función que las escriba.

Consecuencia observable: se crea una factura de RD$ 45.000 con seis líneas, se recarga la página, y la factura aparece con el total correcto pero **sin ninguna línea**. El PDF (`src/components/PdfModal.tsx:165`) recorre `doc.items?.map(...)` y genera una tabla vacía. El documento que se le envía al cliente final queda sin detalle.

Lo mismo con `cuotas`: el calendario de pagos de un préstamo desaparece al recargar, y `LoansView` queda mostrando un préstamo sin cuotas.

**Corrección:** insertar las líneas hijas dentro de la misma operación que el padre, idealmente con una función RPC de Postgres para que sea atómica. Al leer, hacer `select('*, items:factura_items(*)')` para traerlas anidadas.

---

### C4. Los pagos de cuotas de préstamo no se persisten

`src/App.tsx:336-375` — `handleUpdateCuotaEstado` sólo hace `setState`. No llama a ningún servicio.

En `src/services/supabaseDataService.ts` **no existe** `updatePrestamo` ni `updateCuota`. Tampoco se crea un registro en `pagos`. El botón "Registrar Pago" (`src/components/LoansView.tsx:549-556`) marca la cuota como pagada en memoria y nada más: al recargar, la cuota vuelve a estar pendiente.

Es un bug que hace perder dinero — el negocio cobra, el sistema lo olvida, y el cliente puede reclamar que ya pagó sin que quede rastro.

**Corrección:** añadir `updateCuota`/`registrarPagoCuota` al servicio, crear la fila en `pagos` con `prestamo_id` y `cuota_id`, y recalcular el estado del préstamo en el servidor.

---

### C5. Bypass de autenticación en `LoginModal.tsx`

`src/components/LoginModal.tsx` — archivo actualmente **no importado por nadie** (`App.tsx` usa `LoginView`), pero presente en el repositorio:

- Líneas 45-48: el `catch` llama a `onSuccessLogin(email)` ante **cualquier** error de autenticación, contraseña incorrecta incluida. El comentario lo llama "Fallback to local auth".
- Líneas 58-61: `handleQuickLoginYeisito` entra al sistema sin credenciales de ningún tipo.
- Líneas 18-19: credenciales embebidas — `yeisito@minegocio.do` / `123456`.
- Línea 52-55: si no hay cliente Supabase, también entra directo.

Aunque hoy sea código muerto, basta con que alguien lo vuelva a conectar para abrir el sistema entero. En un producto que se vende, no puede existir.

**Corrección:** borrar el archivo.

---

## ALTO — funcionalidad rota que el comprador detecta de inmediato

### A1. No se puede editar ninguna cotización ni factura

`src/components/DocumentsView.tsx` tiene el estado (`:59-60`), la lógica de guardado (`:213`, `:235`) y las props (`onUpdateCotizacion`, `onUpdateFactura`) — pero **nunca se llama a `setEditingCotizacion(cot)` ni `setEditingFactura(fac)` con un valor real**. En las tarjetas del listado sólo hay botones de PDF, WhatsApp, Convertir y Eliminar (`:397-438`, `:515-555`). No hay botón de editar.

El título del modal está fijo en "Nueva Cotización" / "Nueva Factura" (`:578`), y el formulario nunca se precarga con los datos del documento.

La función está construida al 90 % y es inalcanzable. Esto es exactamente lo que reportas como "edición".

### A2. No se puede editar un préstamo

`src/components/LoansView.tsx` no tiene ninguna ruta de edición. Sólo crear y eliminar. Un error al teclear el monto obliga a borrar y rehacer, perdiendo el historial de pagos.

### A3. El detalle del préstamo no se refresca al registrar un pago

`src/components/LoansView.tsx:33` guarda `selectedPrestamo` como copia del objeto. Cuando `handleUpdateCuotaEstado` reemplaza los objetos dentro de `state.prestamos`, `selectedPrestamo` sigue apuntando al objeto viejo. El usuario pulsa "Registrar Pago" y **la pantalla no cambia**, hasta que cierra y vuelve a abrir el modal.

**Corrección:** guardar `selectedPrestamoId: string | null` y derivar el objeto desde `state.prestamos` en cada render.

### A4. Los datos borrados en la nube reaparecen

`src/App.tsx:97-102`:

```ts
clientes: cli.length > 0 ? cli : prev.clientes,
```

Si el usuario borra todos sus clientes, la respuesta del servidor llega vacía y el código **conserva la copia local anterior**, mostrando registros que ya no existen. Igual si se inicia sesión con otra cuenta en el mismo navegador: los datos del usuario anterior siguen en `localStorage` y se mezclan con los nuevos.

Además, `clearStateFromStorage` existe en `store.ts:56` y **nunca se llama** — ni siquiera al cerrar sesión (`App.tsx:129-139`).

### A5. El contador de cuotas atrasadas siempre marca cero

`src/components/DashboardView.tsx:42-47` cuenta `c.estado === 'atrasada'`. Pero las cuotas se crean como `'pendiente'` (`LoansView.tsx:96`) y el único cambio de estado posible las pone en `'pagada'` (`App.tsx:350`). **Nada asigna nunca `'atrasada'`.** `LoansView` calcula el atraso al vuelo comparando fechas (`:179-183`) pero no lo guarda.

Resultado: la alerta de morosidad del panel principal — justo la métrica que justifica comprar un sistema de préstamos — nunca se enciende.

### A6. Las "Acciones Rápidas" del panel no abren nada

`src/App.tsx:415-418`: los cuatro botones sólo cambian de pestaña. `DocumentsView` acepta una prop `initialSubTab` (`:39`) que **App nunca le pasa**, y no existe ninguna prop para abrir el modal automáticamente.

El usuario pulsa "+ Factura" y aterriza en la pestaña de Cotizaciones sin ningún formulario abierto.

### A7. La numeración correlativa se duplica

`src/components/DocumentsView.tsx:83-84`:

```ts
const nextCotNumero = `COT-2026-${String(state.cotizaciones.length + 1).padStart(4, '0')}`;
```

Basado en la longitud del array. Al borrar un documento, el siguiente **reutiliza un número ya emitido**. El año está fijo a `2026` en el código. Para facturas con NCF, dos documentos con el mismo número es un problema fiscal serio.

**Corrección:** secuencia en Postgres o `max(numero)+1` por año, con restricción `unique` en base de datos.

### A8. Los ajustes del negocio sólo viven en el navegador

`src/App.tsx:385` guarda los ajustes únicamente en el estado, que `store.ts:48` vuelca a `localStorage`. **Nada los envía a Supabase.**

Cambiar de teléfono, de computadora o de navegador significa perder el nombre comercial, el logo, el RNC y la tasa de ITBIS. Los PDFs salen firmados como "Mi Negocio".

Agravante: el logo se guarda como data URL en base64 (`SettingsModal.tsx:41-45`). Una foto de 2 MB se convierte en ~2,7 MB de texto dentro de `localStorage`, cuyo límite ronda los 5 MB. Al superarlo, `saveStateToStorage` (`store.ts:48-54`) falla y **sólo escribe en la consola** — a partir de ese momento la aplicación deja de guardar absolutamente todo, en silencio.

**Corrección:** tabla `configuracion_negocio` en Supabase y el logo en Supabase Storage, guardando la URL.

### A9. Borrar un cliente borra en silencio toda su facturación

El esquema define `on delete cascade` sobre `cotizaciones.cliente_id`, `facturas.cliente_id` y `prestamos.cliente_id`. La confirmación (`ClientsView.tsx:186`) sólo dice *"¿Eliminar al cliente X?"*.

Borrar un cliente con dos años de facturas y un préstamo activo elimina todo el historial sin avisar. Además el estado local no aplica la cascada (`App.tsx:163-169` sólo filtra `clientes`), así que la interfaz sigue mostrando facturas huérfanas hasta recargar.

**Corrección:** advertir con el conteo exacto de documentos afectados, y preferir baja lógica (`activo = false`) sobre borrado físico para clientes con historial.

### A10. Los errores nunca llegan al usuario — la app finge que guardó

Todos los métodos de `supabaseDataService.ts` tragan el fallo (`console.warn`) y devuelven `null`, `false` o `[]`. Después, en `App.tsx:142-152`:

```ts
const created = await supabaseDataService.createCliente(clienteData);
const newCliente: Cliente = created || {
  ...clienteData,
  id: `cli-${Date.now()}`,     // id inventado
  created_at: new Date().toISOString(),
};
```

Si el guardado falla — sin internet, RLS, sesión expirada — la aplicación **inventa un registro local y lo muestra como si se hubiera guardado**. El usuario ve su cliente en pantalla, cierra el navegador, y al volver no está.

Peor: ese id falso (`cli-1753...`) no es un UUID. Si se usa después como `cliente_id` de una factura, Postgres rechaza la inserción y esa factura tampoco se guarda, otra vez en silencio.

Esto es, con toda probabilidad, la raíz de los "errores creando cosas" que reportas.

**Corrección:** propagar el error, mostrar un aviso claro, y no crear nunca registros locales con id inventado.

---

## MEDIO — interfaz, validación y deuda técnica

### M1. Texto blanco sobre fondo blanco (invisible)

- `src/components/ClientsView.tsx:367` — `text-white` en el nombre del cliente dentro de la ficha
- `src/components/LoansView.tsx:456` — `text-white` en el nombre del deudor en el detalle del préstamo

En ambos casos el contenedor es `bg-white`. El nombre simplemente no se ve.

### M2. Restos del tema oscuro sobre el tema claro

El proyecto migró a tema claro (commits `108acac`, `baded47`) pero quedaron zonas sin convertir:

| Ubicación | Problema |
|---|---|
| `DocumentsView.tsx:733` | `bg-slate-950` en la caja de "Importe" de cada línea |
| `DocumentsView.tsx:743` | `bg-slate-950/80` en el panel de totales, con etiquetas `text-slate-400` |
| `LoansView.tsx:403` | `from-slate-950 to-slate-900` en "Resumen en Vivo", con texto `text-slate-600` — oscuro sobre oscuro |
| `LoansView.tsx:508,510` | `bg-emerald-950/20`, `bg-red-950/20` en las tarjetas de cuota |
| `ServicesView.tsx` (completo) | Todo el componente sigue en tema oscuro (`bg-slate-800/80`, `bg-slate-900`, `text-slate-100`) pero se renderiza **dentro del `SettingsModal` blanco**. El encabezado `text-slate-100` de la línea 103 es invisible. |
| `PdfModal.tsx:36,80` | Cromo `bg-slate-900` / `bg-slate-950` |
| `vite.config.ts:19-20` | PWA con `theme_color` y `background_color` en `#0f172a` (oscuro), contra `#f8fafc` en `index.html:7` — la pantalla de arranque parpadea en oscuro |

El catálogo de servicios es la peor: es una pantalla entera con la que el comprador va a trabajar y está visualmente rota.

### M3. La impresión pierde todos los estilos y abre un vector de XSS

`src/utils/pdfGenerator.ts:28-47` — `printDocumentElement` inyecta `element.innerHTML` en una ventana en blanco con una hoja de estilos mínima. Las clases de Tailwind se pierden por completo: **lo impreso no se parece a la vista previa**.

Y el contenido inyectado incluye las descripciones de las líneas, que **nunca pasan por `sanitizeString`** — `updateLineItem` (`DocumentsView.tsx:163-175`) las guarda tal cual. Sólo `notas` se sanea (`:209`). Una descripción con `<img src=x onerror=...>` se ejecuta en la ventana emergente, en el mismo origen.

**Corrección:** usar una hoja de estilos `@media print` sobre el elemento real e invocar `window.print()`, sin `document.write`.

### M4. `sanitizeString` da una falsa sensación de seguridad

`src/utils/sanitizer.ts:6-11` sólo elimina `<` y `>`. No es un saneador. React ya escapa por defecto, así que el único riesgo real es la ruta `innerHTML` de M3 — hay que arreglar esa ruta, no confiar en esta función. Aplicarla además destruye texto legítimo (`Descuento 2 x 3 <ver nota>`).

### M5. Efecto secundario dentro del actualizador de `setState`

`src/App.tsx:307` — `supabaseDataService.updateFactura(...)` se llama **dentro** del callback de `setState`. React ejecuta los actualizadores dos veces en `StrictMode` (activo en `main.tsx:7`), así que en desarrollo cada pago dispara dos escrituras a la base de datos. Además el actualizador deja de ser puro.

### M6. El cliente de Supabase se cachea para siempre

`src/services/supabaseClient.ts:14` — `if (!supabaseClient)` devuelve siempre la primera instancia, ignorando los argumentos `url`/`key` posteriores. El efecto de `App.tsx:54-75` depende de `state.settings.supabase_url` pero recibe el cliente viejo. Si algún día permites que cada comprador apunte a su propio proyecto, cambiarlo no surtirá efecto hasta recargar.

### M7. Validación de negocio ausente

- **Sobrepago:** `handleConfirmPayment` (`DocumentsView.tsx:253-265`) sólo comprueba `> 0`. El atributo `max` del input (`:847`) no se valida en el envío. Si se abona de más, `App.tsx:290` lo recorta con `Math.max(0, ...)` y **el excedente desaparece sin registro**.
- **Clientes duplicados:** nada impide crear dos clientes con el mismo RNC o cédula.
- **Formatos:** `formatDocumento` (`sanitizer.ts:66-78`) sólo da formato a 9 u 11 dígitos; no valida. No hay validación de correo más allá del `type="email"` del navegador.
- **Cantidades negativas:** `updateLineItem` acepta cualquier valor tecleado; `min="1"` sólo actúa en el envío nativo del formulario.
- **Cuotas parciales:** el botón siempre paga `cuota.monto` completo (`LoansView.tsx:551`). No se puede abonar RD$ 500 a una cuota de RD$ 2.000, que es justamente como funciona el cobro real en la calle.

### M8. Sin estados de carga ni protección contra doble envío

Ningún botón de guardar se deshabilita mientras la operación está en curso. Los manejadores `onAdd*` son `async` pero los componentes los invocan sin `await` (`DocumentsView.tsx:216`, `:238`). Un doble clic crea dos facturas.

### M9. Diálogos nativos del navegador

`alert()` y `confirm()` en `DocumentsView.tsx:194,429,546`, `ClientsView.tsx:186`, `LoansView.tsx:69,583`, `ServicesView.tsx:157`. Bloquean el hilo, no se pueden estilizar, y algunos navegadores integrados (Instagram, Facebook) los suprimen — el usuario pulsa Eliminar y no pasa nada. En un producto de pago hay que sustituirlos por modales y avisos propios.

### M10. El modelo de préstamos es interés simple plano

`src/components/LoansView.tsx:50`:

```ts
const interesTotalLive = roundMoney(montoPrestado * (tasaInteres / 100));
```

El interés no depende del plazo ni de la frecuencia: 10 % sobre RD$ 10.000 son RD$ 1.000 tanto en 4 cuotas quincenales como en 60 mensuales. No hay mora, ni recálculo por pago anticipado, ni amortización.

Puede ser una decisión deliberada — así se presta en muchos negocios pequeños — pero hay que decidirlo y dejarlo explícito en la interfaz, o implementar amortización real. Tal como está, un comprador que preste a 12 meses va a perder dinero.

### M11. Sin exportación ni reportes

No hay exportación a CSV o Excel, ni informes por rango de fechas, ni estado de cuenta por cliente, ni cierre mensual, ni formatos 606/607 de la DGII. Es lo primero que va a pedir cualquier negocio dominicano que facture en serio.

### M12. El NCF no tiene ningún control

`src/components/DocumentsView.tsx:643` es un campo de texto libre. No hay gestión de secuencias, ni validación del tipo (B01, B02, B14, B15), ni control de rango asignado ni de vencimiento. Si vendes a negocios que emiten comprobantes fiscales, van a chocar con esto de inmediato.

---

## BAJO — higiene

### B1. Código muerto

| Elemento | Ubicación | Nota |
|---|---|---|
| `LoginModal.tsx` | archivo completo | No importado. Contiene el bypass de C5. **Borrar.** |
| `SUPABASE_SQL_SCHEMA` | `supabaseClient.ts:25-181` | Exportado, nunca importado, y contradice la migración real |
| `clearStateFromStorage` | `store.ts:56-62` | Nunca se llama — debería usarse al cerrar sesión |
| `initialSubTab` | `DocumentsView.tsx:39,52` | Prop declarada que App nunca pasa |
| `App.css` | 184 líneas | No lo importa nadie; `main.tsx` sólo carga `index.css` |
| `src/assets/react.svg` | — | Archivo de 0 bytes |

### B2. Dependencias innecesarias en el bundle

`package.json` incluye `pg` y `@types/pg` — el driver de Postgres para Node. En una aplicación de navegador no puede ejecutarse jamás. No se importa en ningún sitio. Fuera.

### B3. `any` en fronteras de tipos

`SettingsModal.tsx:18-20` tipa tres props como `any`. `DocumentsView.tsx:163` recibe `value: any`. `TutorialModal.tsx:44,54` usa `any` para sortear la importación de Joyride.

### B4. `formatCurrency` depende de un `replace` frágil

`sanitizer.ts:23` hace `.format(num).replace('DOP', 'RD$')`. La salida de `Intl` para `es-DO` puede venir ya como `RD$` según el motor, en cuyo caso el `replace` no encuentra nada y el resultado depende del navegador.

### B5. Sin pruebas

Cero tests. No hay dependencias de testing en `package.json`. Para un producto que se vende, los cálculos de ITBIS, saldos y cuotas necesitan al menos pruebas unitarias.

### B6. `user-scalable=no` en el viewport

`index.html:6` impide hacer zoom. Es una barrera de accesibilidad real para usuarios con baja visión y iOS lo ignora desde hace años.

---

## Orden de trabajo recomendado

**Fase 1 — Seguridad (nada se publica antes de esto)**
C1, C2, C5, y B1 en la parte del `SUPABASE_SQL_SCHEMA` duplicado.

**Fase 2 — Integridad de datos**
C3, C4, A4, A8, A10. Sin esto la aplicación pierde información del comprador.

**Fase 3 — Funcionalidad rota**
A1, A2, A3, A5, A6, A7, A9.

**Fase 4 — Acabado vendible**
M1, M2, M3, M7, M8, M9. Aquí es donde el producto empieza a parecer un producto.

**Fase 5 — Diferenciación comercial**
M10, M11, M12, B5. Reportes y control fiscal son lo que justifica el precio frente a una hoja de cálculo.
