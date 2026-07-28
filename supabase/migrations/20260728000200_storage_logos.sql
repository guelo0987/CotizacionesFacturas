-- =====================================================================
-- Almacenamiento de logos
-- =====================================================================
-- El logo del negocio se guarda aquí en vez de como data URL en base64
-- dentro de localStorage, donde una imagen de 2 MB agotaba la cuota del
-- navegador y hacía que la aplicación dejara de guardar todo en silencio.
--
-- Cada organización sólo puede escribir dentro de su propia carpeta, cuyo
-- nombre es su `organizacion_id`. La lectura es pública porque la URL del
-- logo se incrusta en los PDF y en los enlaces que se envían a clientes.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos',
  'logos',
  true,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "logos lectura publica"      on storage.objects;
drop policy if exists "logos escritura propia"     on storage.objects;
drop policy if exists "logos actualizacion propia" on storage.objects;
drop policy if exists "logos borrado propio"       on storage.objects;

create policy "logos lectura publica" on storage.objects
  for select
  using (bucket_id = 'logos');

-- `storage.foldername(name)[1]` es la primera carpeta de la ruta, que la
-- aplicación construye como `<organizacion_id>/logo.<ext>`.
create policy "logos escritura propia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select public.org_actual())::text
  );

create policy "logos actualizacion propia" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select public.org_actual())::text
  )
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select public.org_actual())::text
  );

create policy "logos borrado propio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select public.org_actual())::text
  );
