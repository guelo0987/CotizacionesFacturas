-- =====================================================================
-- Código QR del negocio
-- =====================================================================
-- Cada negocio sube su propio QR (redes sociales, catálogo, pago) y este
-- sale al pie de sus cotizaciones y facturas.
--
-- Va en `configuracion_negocio` junto al logo, y el archivo se guarda en
-- el bucket `logos` dentro de la carpeta de la organización
-- (`<organizacion_id>/qr.<ext>`). Las políticas de Storage ya filtran por
-- esa carpeta y no distinguen el nombre del archivo, así que no hace
-- falta un bucket nuevo ni permisos adicionales.
-- =====================================================================

alter table public.configuracion_negocio
  add column if not exists qr_url text not null default '';
