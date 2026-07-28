# Prompt para dejar el sistema listo para vender

> Pégalo completo en una sesión nueva del agente, dentro del repositorio.
> Requiere que `AUDITORIA.md` esté presente en la raíz del proyecto.

---

## CONTEXTO

Trabajas sobre `jsoncotable`: una aplicación web de gestión para pequeños negocios de la República Dominicana que maneja **cotizaciones, facturas con ITBIS y NCF, y préstamos con cuotas**. Stack: React 19 + TypeScript + Vite 8 + Tailwind 4 + Supabase (auth y base de datos) + PWA. Despliegue en Vercel. Interfaz en español, moneda RD$.

El objetivo es **dejarlo en condiciones de venderse a negocios reales**. Hoy no lo está: la base de datos es públicamente accesible sin autenticación, tres flujos de datos centrales no se guardan nunca, y la edición de documentos está construida a medias y es inalcanzable desde la interfaz.

**Lee `AUDITORIA.md` en la raíz antes de tocar nada.** Contiene 33 hallazgos con referencias exactas de archivo y línea, agrupados en cinco fases. Ese documento es tu especificación. Este prompt define cómo ejecutarla.

---

## MODELO DE NEGOCIO (ya decidido — no lo replantees)

**SaaS multi-inquilino.** Un solo proyecto Supabase, propiedad del vendedor. Cada negocio comprador es una organización con sus datos completamente aislados de los demás. Se cobra por suscripción y las altas son inmediatas.

Esto implica, en la Fase 1:

- Tabla `organizaciones` (nombre, RNC, plan, fecha de alta, estado de suscripción).
- Tabla `perfiles` que vincula `auth.users` con su `organizacion_id` y su rol.
- Columna `organizacion_id not null` en las nueve tablas de datos, con índice.
- Todas las políticas RLS filtran por la organización del usuario autenticado, resuelta mediante una función `security definer` para evitar recursión en las políticas.
- Un usuario nuevo que se registra crea su organización y queda como propietario.
- Sin excepciones tipo `or organizacion_id is null`: cualquier escape en la condición reabre la fuga que estás cerrando.

Migrar los datos que ya existan en el proyecto actual a una organización inicial, y no dejar filas huérfanas sin `organizacion_id`.

---

## REGLAS DE EJECUCIÓN

1. **Trabaja por fases, en orden.** No empieces la Fase 2 sin haber terminado la 1. La seguridad va primero porque todo lo demás se construye encima.
2. **Una rama por fase**, con commits pequeños y descriptivos en español. No hagas commit en `main`.
3. **Después de cada fase**: `npm run build` y `npm run lint` deben pasar limpios. Los 8 warnings actuales de `oxlint` señalan bugs reales — deben desaparecer arreglando el bug, no silenciando la regla.
4. **Verifica lo que arreglas.** Para cada corrección de pérdida de datos, la prueba es: crear el registro → recargar la página → comprobar que sigue ahí y completo. Dilo en el informe con ese nivel de detalle.
5. **No inventes que algo funciona.** Si una fase queda a medias, termina todo lo demás y di con precisión qué quedó fuera y por qué.
6. **Nunca crees registros locales con id inventado** para disimular un fallo de red. Ese antipatrón (`App.tsx:142-152`) es la causa de los errores al crear que reporta el dueño. Si falla, el usuario tiene que enterarse.
7. **No cambies el idioma ni el ámbito funcional.** No añadas funciones que no estén en la auditoría sin decirlo antes.
8. **Migraciones SQL versionadas** en `supabase/migrations/`, nunca SQL suelto en el código TypeScript.

---

## FASE 1 — Seguridad

Bloqueante absoluto. Nada se publica antes de terminar esto.

- **C1**: reescribir las políticas RLS según el modelo multi-inquilino de arriba. Hoy son `using (true)` y hay un `grant all ... to anon` sobre todas las tablas — cualquiera con la clave anónima del bundle lee y borra todo. Filtrar por `organizacion_id` sin excepciones, `revoke all from anon`, y políticas propias para `cotizacion_items`, `factura_items`, `cuotas` y `pagos` derivando la organización desde su tabla padre.
- **C2**: eliminar el proyecto Supabase cableado por defecto en `store.ts:14` y `.env.example:2`. Las credenciales salen de variables de entorno, sin valor por defecto, y `supabase_url`/`supabase_anon_key` dejan de vivir en `BusinessSettings` (`types/index.ts:140-141`) — en SaaS no las configura el comprador. Si las variables faltan, error explícito de configuración, nunca una conexión silenciosa.
- **Alta de cuenta**: `LoginView.tsx` sólo permite iniciar sesión. Un SaaS necesita registro con creación de organización, y recuperación de contraseña vía `resetPasswordForEmail` — hoy remite a un correo de soporte (`LoginView.tsx:151-156`), lo cual no escala.
- **C5**: borrar `src/components/LoginModal.tsx` completo (bypass de login y credenciales embebidas).
- **B1 parcial**: borrar `SUPABASE_SQL_SCHEMA` de `supabaseClient.ts:25-181`, que contradice la migración real. Una sola fuente de verdad para el esquema.

**Criterio de aceptación:** con la clave anónima y sin iniciar sesión, una petición directa a la API REST de Supabase devuelve cero filas en todas las tablas. Con dos organizaciones distintas dadas de alta, ninguna ve un solo registro de la otra — ni siquiera forzando un `organizacion_id` ajeno en la petición. Demuéstralo con las peticiones concretas que ejecutaste.

---

## FASE 2 — Integridad de datos

- **C3**: persistir las líneas de cotizaciones y facturas. Hoy `supabaseDataService.ts` (líneas 94, 106, 133, 145, 172) las descarta con destructuring y las tablas hijas nunca reciben un `insert`. Consecuencia: la factura se guarda sin detalle y el PDF sale con la tabla vacía. Inserta padre e hijos de forma atómica (función RPC de Postgres) y léelos anidados con `select('*, items:factura_items(*)')`.
- **C4**: persistir los pagos de cuotas de préstamo. `App.tsx:336-375` sólo toca el estado en memoria; no existe `updateCuota` ni se crea fila en `pagos`. Añádelos y recalcula el estado del préstamo en el servidor.
- **A4**: quitar el patrón `cli.length > 0 ? cli : prev.clientes` de `App.tsx:97-102`, que resucita datos ya borrados. Confía en la respuesta del servidor y llama a `clearStateFromStorage()` al cerrar sesión.
- **A8**: mover los ajustes del negocio a Supabase (tabla `configuracion_negocio`). Hoy sólo viven en `localStorage`, así que cambiar de dispositivo borra el logo, el RNC y la tasa de ITBIS. Sube el logo a Supabase Storage en vez de guardarlo en base64 — un logo de 2 MB agota la cuota de `localStorage` y a partir de ahí la app deja de guardar todo, en silencio.
- **A10**: propagar los errores del servicio de datos hasta la interfaz con mensajes claros en español. Eliminar el fallback de id inventado.

**Criterio de aceptación:** crear una factura de 6 líneas, un préstamo de 8 cuotas, y registrar un pago en cada uno. Recargar. Todo sigue completo, con sus líneas y sus cuotas. Cerrar sesión y entrar con otro usuario: no queda ni un dato del anterior.

---

## FASE 3 — Funcionalidad rota

- **A1**: hacer alcanzable la edición de cotizaciones y facturas. El estado y la lógica de guardado ya existen en `DocumentsView.tsx` (`:59-60`, `:213`, `:235`) — falta el botón, la precarga del formulario y que el título del modal deje de estar fijo en "Nueva" (`:578`).
- **A2**: añadir edición de préstamos.
- **A3**: `LoansView.tsx:33` guarda una copia del préstamo, así que registrar un pago no refresca la pantalla. Guarda `selectedPrestamoId` y deriva el objeto del estado.
- **A5**: el contador de cuotas atrasadas del panel siempre marca cero porque nada asigna nunca el estado `'atrasada'`. Calcúlalo de forma consistente (preferible: vista o campo derivado en la base de datos).
- **A6**: las cuatro "Acciones Rápidas" del panel sólo cambian de pestaña sin abrir ningún formulario. Que abran el modal correcto.
- **A7**: la numeración correlativa se basa en `array.length + 1` y el año está fijo a `2026` — al borrar un documento se reutiliza un número ya emitido. Secuencia en Postgres con restricción `unique`.
- **A9**: borrar un cliente arrastra en cascada todas sus facturas, cotizaciones y préstamos sin avisar. Advierte con el conteo exacto y usa baja lógica para clientes con historial.

**Criterio de aceptación:** editar una factura existente cambiando cliente, líneas e ITBIS, y que el cambio sobreviva a una recarga. Emitir 3 facturas, borrar la segunda, emitir una cuarta: el número no se repite.

---

## FASE 4 — Acabado vendible

- **M1**: texto blanco sobre fondo blanco en `ClientsView.tsx:367` y `LoansView.tsx:456` — nombres invisibles.
- **M2**: terminar la migración al tema claro. Quedan cajas oscuras en `DocumentsView.tsx:733,743` y `LoansView.tsx:403,508,510`; el `PdfModal` conserva cromo oscuro; y **`ServicesView.tsx` está entero en tema oscuro dentro de un modal blanco** — es la pantalla peor rota del sistema. Alinea también el `theme_color` de la PWA (`vite.config.ts:19-20`) con el `#f8fafc` de `index.html`.
- **M3**: `printDocumentElement` (`pdfGenerator.ts:28-47`) inyecta `innerHTML` en una ventana en blanco: pierde todo Tailwind y abre un XSS con las descripciones de líneas, que nunca se sanean. Sustitúyelo por una hoja `@media print` sobre el elemento real.
- **M7**: validación de negocio — impedir sobrepagos (hoy el excedente desaparece sin registro), detectar clientes duplicados por RNC/cédula, validar formatos dominicanos, y **permitir abonos parciales a una cuota de préstamo**, que es como se cobra en la práctica.
- **M8**: deshabilitar los botones de guardar mientras la operación está en curso; hoy un doble clic crea dos facturas.
- **M9**: sustituir todos los `alert()` y `confirm()` por modales y avisos propios. Los navegadores integrados de Instagram y Facebook los suprimen: el usuario pulsa Eliminar y no ocurre nada.

**Criterio de aceptación:** recorrer las cuatro pestañas y los ajustes en móvil y escritorio sin encontrar texto ilegible ni un solo diálogo nativo. Imprimir una factura y que salga igual que la vista previa.

---

## FASE 5 — Diferenciación comercial

- **M10**: decidir el modelo de préstamos. Hoy el interés es plano y no depende del plazo (`LoansView.tsx:50`): 10 % sobre RD$ 10.000 son RD$ 1.000 tanto a 4 quincenas como a 60 meses. O se implementa amortización real, o se deja explícito en la interfaz que es interés fijo. Añadir mora por atraso.
- **M11**: exportación a CSV/Excel, informes por rango de fechas, estado de cuenta por cliente y cierre mensual.
- **M12**: control de NCF — secuencias, validación de tipo (B01, B02, B14, B15), rango asignado y vencimiento.
- **B5**: pruebas unitarias de los cálculos de dinero: ITBIS, saldos, generación de cuotas, redondeo.
- **B2**: quitar `pg` y `@types/pg` de `package.json` (driver de Node que nunca puede ejecutarse en el navegador).
- **B6**: quitar `user-scalable=no` de `index.html:6`.

---

## ENTREGABLE FINAL

Al terminar, entrega un informe con:

1. Qué se corrigió por fase, con archivos y líneas.
2. Cómo verificaste cada corrección de pérdida de datos — el paso a paso real, no "debería funcionar".
3. Qué quedó pendiente y por qué.
4. Los pasos exactos para desplegar: migraciones a aplicar, variables de entorno a configurar en Vercel, y qué hacer con los datos que ya existan en el proyecto actual.
5. Riesgos que siguen abiertos de cara a un comprador real.
