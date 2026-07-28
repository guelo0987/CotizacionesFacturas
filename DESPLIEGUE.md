# Despliegue manual — paso a paso

Todo lo que hay que hacer a mano para dejar el sistema funcionando. Los
scripts se ejecutan desde **SQL Editor** en el panel de Supabase.

Tiempo estimado: 20–30 minutos.

---

## Antes de empezar: haz un respaldo

Panel de Supabase → **Database** → **Backups** → descarga un respaldo.

Los scripts cambian claves foráneas, políticas y permisos. Si algo sale mal,
querrás poder volver atrás. **No sigas sin esto.**

> Si puedes, prueba primero en un proyecto nuevo de Supabase antes de tocar
> el que ya usas. Estos scripts nunca se han ejecutado contra un Postgres
> real: están escritos y revisados, pero no probados en ejecución.

---

## Paso 1 — Ejecutar los scripts SQL

En **SQL Editor**, abre una consulta nueva para cada archivo, pega el
contenido completo y pulsa **Run**. **En este orden, uno por uno**, esperando
a que cada uno termine antes del siguiente:

| # | Archivo | Qué hace |
|---|---|---|
| 1 | `supabase/migrations/20260728000000_multi_tenant_y_rls.sql` | Cierra el acceso anónimo, crea organizaciones y perfiles, añade `organizacion_id` a todas las tablas, migra los datos existentes, sanea datos heredados, aplica el RLS real |
| 2 | `supabase/migrations/20260728000100_funciones_negocio.sql` | Funciones de negocio: numeración correlativa, guardado atómico de documentos con sus líneas, pagos, préstamos |
| 3 | `supabase/migrations/20260728000200_storage_logos.sql` | Bucket de logos con acceso por organización |
| 4 | `supabase/migrations/20260728000300_verificacion.sql` | **No modifica nada.** Comprueba que todo quedó bien |

Cada script es autónomo e idempotente: puedes volver a ejecutarlo sin romper
nada si algo falla a medias.

### Qué esperar del script 1

Es el más largo. Hace, entre otras cosas:

- Agrupa todo lo que ya existe bajo una organización llamada
  **«Organización inicial»** y te asocia a ella. No se pierde nada.
- Renombra los números de factura duplicados añadiéndoles `-DUP1`. Los tienes
  casi seguro, porque el código anterior los generaba contando elementos de un
  array y borrar un documento hacía que el siguiente reutilizara un número.
- Borra pagos sin destino y documentos que apuntaban a clientes ya eliminados.

### El script 4 es el que importa

Devuelve una tabla con 11 comprobaciones. **Todas deben decir `OK`.**

| comprobacion | valor | resultado |
|---|---|---|
| El rol anonimo no tiene permisos de tabla | 0 | OK |
| … | … | OK |

Si alguna dice `FALLO`, **no publiques nada** y dime cuál es.

---

## Paso 2 — Comprobar que la base ya no está abierta

Este es el fallo más grave que tenía el sistema: cualquiera podía leer y
borrar los datos de todos los negocios sin iniciar sesión.

Abre una terminal y ejecuta esto, sustituyendo la clave por tu
`VITE_SUPABASE_ANON_KEY`:

```bash
curl -s "https://hxeovachlapvfubcebha.supabase.co/rest/v1/clientes?select=*" -H "apikey: PEGA_AQUI_TU_CLAVE_ANONIMA"
```

Debe devolver un **error de permisos**, no una lista de clientes. Repítelo
cambiando `clientes` por `facturas`, `prestamos` y `pagos`.

Si te devuelve datos, algo del paso 1 no se aplicó. Para.

---

## Paso 3 — Configurar la autenticación

Panel de Supabase → **Authentication** → **Sign In / Providers** → **Email**:

- **Confirm email**: actívalo si quieres que los compradores verifiquen su
  correo. La aplicación funciona con las dos opciones.
- **Minimum password length**: `8` (es lo que valida la interfaz).

Panel → **Authentication** → **URL Configuration**:

- **Site URL**: la URL de producción (la de Vercel).
- **Redirect URLs**: añade también `http://localhost:4173` para desarrollo.

Sin esto, el enlace de recuperación de contraseña no lleva a ningún sitio.

---

## Paso 4 — Variables de entorno en Vercel

Ya no hay ningún proyecto de Supabase escrito en el código. Si faltan estas
variables, la aplicación muestra una pantalla de configuración en vez de
conectarse a ninguna parte.

Vercel → tu proyecto → **Settings** → **Environment Variables**:

```
VITE_SUPABASE_URL=https://hxeovachlapvfubcebha.supabase.co
VITE_SUPABASE_ANON_KEY=<tu clave anónima>
```

Después, **Deployments** → **Redeploy**. Vite incrusta estas variables al
compilar: cambiarlas sin reconstruir no surte efecto.

En local van en el archivo `.env` de la raíz, que ya está en `.gitignore`.

---

## Paso 5 — Prueba de humo (10 minutos)

Con la aplicación ya desplegada:

**Cuenta y negocio**
1. Entra. Debe salir la pantalla de inicio de sesión.
2. Pulsa «Crea tu cuenta», regístrate con un correo real.
3. Debe pedirte el nombre del negocio. Créalo.

**Que los datos se guardan de verdad** — esto es lo que antes fallaba
4. Crea un cliente.
5. Crea una factura con **6 líneas** distintas.
6. **Recarga la página (F5).**
7. Abre la factura → deben estar las 6 líneas.
8. Abre la vista previa del PDF → la tabla debe tener las 6 filas.
9. Registra un pago parcial. Recarga. El saldo debe seguir bien.

**Préstamos**
10. Crea un préstamo de **8 cuotas**. Recarga. Deben estar las 8.
11. Abona **menos** del total de una cuota. Recarga. El abono sigue ahí.

**Numeración**
12. Emite tres facturas, borra la segunda, emite una cuarta.
13. El número de la cuarta **no** debe repetir ninguno anterior.

**Sobrepago**
14. Intenta abonar a una factura más de su saldo pendiente.
15. Debe rechazarlo con un mensaje claro, no aceptarlo en silencio.

**Aislamiento entre negocios**
16. Regístrate con un segundo correo y crea otro negocio.
17. Esa cuenta no debe ver ni un solo dato de la primera.

---

## Lo que se pierde y no se puede recuperar

Las cotizaciones y facturas anteriores **no tienen líneas de detalle**. El
código viejo las descartaba antes de guardar, así que esa información nunca
llegó a la base de datos. Aparecerán con su total correcto y la tabla de
detalle vacía. No hay forma de reconstruirlas.

---

## Decisiones que quedan pendientes

- **Mora por atraso**: no está implementada. Hace falta fijar una tasa, un
  período de gracia y revisar los topes legales aplicables. No me pareció
  correcto inventarte una política de cobro. La estructura (estado
  `atrasada`, fecha de vencimiento, abonos parciales) ya lo soporta.
- **Modelo de préstamo**: el interés es fijo sobre el capital y no varía con
  el plazo — 10% sobre RD$10.000 son RD$1.000 tanto a 4 quincenas como a 60
  meses. Está rotulado así en la interfaz. Si vas a prestar a plazos largos,
  conviene revisarlo.
- **Cobro del propio SaaS**: la tabla `organizaciones` tiene campos `plan` y
  `estado`, pero nada cobra ni suspende cuentas todavía.

---

## Opcional: servidor MCP de Supabase

El proyecto trae [`.mcp.json`](.mcp.json) configurado. Para usarlo hace falta
tener el CLI de Claude Code en el PATH y autenticarse una vez:

```bash
claude mcp list
```

Si `/mcp` dice que no hay servidores configurados, es que la sesión no ha
cargado el archivo del proyecto: reinicia Claude Code desde la carpeta del
proyecto y aprueba el servidor cuando lo pregunte.

**No hace falta para desplegar.** Sirve para que el agente pueda ejecutar y
verificar el SQL por su cuenta en vez de que lo hagas tú a mano.
