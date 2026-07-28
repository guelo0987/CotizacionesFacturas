# Guía de despliegue

Pasos para poner en marcha la versión endurecida del sistema. Sigue el orden:
la aplicación nueva **no funciona contra el esquema antiguo**.

---

## 1. Respaldo (antes de nada)

En el panel de Supabase → *Database* → *Backups*, descarga un respaldo del
proyecto actual. Las migraciones cambian claves foráneas, políticas y
permisos; conviene poder volver atrás.

---

## 2. Aplicar las migraciones

Tres archivos en `supabase/migrations/`, **en este orden**:

| Archivo | Qué hace |
|---|---|
| `20260728000000_multi_tenant_y_rls.sql` | Organizaciones, perfiles, `organizacion_id` en todas las tablas, RLS real, revocación del acceso anónimo |
| `20260728000100_funciones_negocio.sql` | Funciones RPC: numeración correlativa, guardado atómico de documentos, pagos, préstamos |
| `20260728000200_storage_logos.sql` | Bucket de Storage para los logos, con acceso por organización |

Con la CLI, sobre el proyecto enlazado:

```bash
npx supabase db push
```

O bien pegando cada archivo, uno por uno, en *SQL Editor* del panel de Supabase.

**Nota:** estos archivos no se han ejecutado contra un Postgres real durante el
desarrollo (no había Docker disponible en el entorno). Ejecútalos primero en un
proyecto de prueba, no directamente en producción.

### Vía MCP de Supabase

El proyecto ya trae [`.mcp.json`](.mcp.json) con el servidor MCP configurado.
Para poder usarlo hay que autenticarse una sola vez, desde una terminal normal
(no desde la extensión del IDE):

```bash
claude /mcp
```

Selecciona `supabase` → *Authenticate*. Después **reinicia Claude Code**: los
servidores MCP se cargan al arrancar la sesión, así que las herramientas no
aparecen hasta entonces. A partir de ahí se pueden aplicar las migraciones y
verificar el resultado desde el propio agente.

### Qué pasa con los datos existentes

La primera migración agrupa todo lo que ya exista bajo una organización llamada
**«Organización inicial»** y asocia a ella todos los usuarios que ya estén en
`auth.users`. Nada se pierde. Después de aplicarla, entra con tu usuario de
siempre y verifica que ves tus clientes y facturas.

Ojo: las cotizaciones y facturas antiguas **no tienen líneas de detalle**,
porque el código anterior nunca las guardó. Aparecerán con su total correcto y
con la tabla de líneas vacía. No hay forma de recuperarlas: esa información
nunca llegó a la base de datos.

---

## 3. Variables de entorno

Ya no hay proyecto por defecto en el código. Si faltan estas variables, la
aplicación muestra una pantalla de configuración en lugar de conectarse a
ningún sitio.

En Vercel → *Settings* → *Environment Variables*:

```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU-CLAVE-ANONIMA
```

Hay que **reconstruir** después de cambiarlas: Vite las incrusta en tiempo de
compilación, no las lee en caliente.

En local, el archivo `.env` de la raíz (ya está en `.gitignore`).

---

## 4. Configuración de Supabase Auth

En *Authentication* → *Providers* → *Email*:

- **Confirm email**: actívalo si quieres que los compradores verifiquen su
  correo antes de entrar. La aplicación contempla los dos casos.
- **Minimum password length**: 8 (la interfaz valida ese mínimo).

En *Authentication* → *URL Configuration*:

- **Site URL**: la URL de producción. La recuperación de contraseña usa
  `window.location.origin`, así que el enlace del correo debe poder volver ahí.
- **Redirect URLs**: añade también `http://localhost:4173` para desarrollo.

---

## 5. Verificación posterior al despliegue

Ejecuta esto **antes** de dar acceso a nadie.

### 5.1. La base de datos ya no está abierta

Sin iniciar sesión, con la clave anónima que aparece en el bundle:

```bash
curl "https://TU-PROYECTO.supabase.co/rest/v1/clientes?select=*" \
  -H "apikey: TU-CLAVE-ANONIMA"
```

Debe devolver un error de permisos o una lista vacía — **nunca** filas con
datos. Repítelo con `facturas`, `prestamos` y `pagos`.

### 5.2. Aislamiento entre negocios

1. Registra dos cuentas con correos distintos.
2. Crea una organización en cada una, con un cliente distinto en cada una.
3. Entra con la primera: debe ver sólo su cliente.
4. Entra con la segunda: debe ver sólo el suyo.

### 5.3. Los datos persisten de verdad

Este es el fallo que más daño hacía. Compruébalo paso a paso:

1. Crea una factura con **6 líneas** distintas.
2. Recarga la página (F5).
3. Abre la factura → deben estar las 6 líneas.
4. Abre la vista previa del PDF → la tabla debe tener las 6 filas.
5. Registra un pago parcial. Recarga. El saldo debe seguir actualizado.
6. Crea un préstamo de **8 cuotas**. Recarga. Deben estar las 8.
7. Abona parcialmente una cuota. Recarga. El abono debe seguir ahí.

### 5.4. Numeración correlativa

1. Emite tres facturas.
2. Elimina la segunda.
3. Emite una cuarta → su número **no** debe repetir ninguno anterior.

### 5.5. Sobrepago

Intenta abonar a una factura más de su saldo pendiente. Debe rechazarlo con un
mensaje claro, no recortarlo en silencio.

---

## 6. Cosas que quedan pendientes de decidir

- **Mora por atraso**: no está implementada. Requiere fijar una tasa, un
  período de gracia y comprobar los topes legales aplicables. La estructura
  (estado `atrasada`, fecha de vencimiento, abonos parciales) ya está lista
  para soportarla cuando decidas la política.
- **Modelo de préstamo**: el interés es fijo sobre el capital y no varía con el
  plazo. Está rotulado así en la interfaz. Si vas a prestar a plazos largos,
  conviene evaluar si necesitas amortización real.
- **Facturación del propio SaaS**: la tabla `organizaciones` tiene campos
  `plan` y `estado`, pero nada cobra ni suspende cuentas todavía.
