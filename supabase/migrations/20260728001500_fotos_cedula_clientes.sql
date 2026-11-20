-- =====================================================================
-- Fotos de la cédula de los clientes (frente y detrás)
-- =====================================================================
-- Las fotos de una cédula son datos personales: el bucket es PRIVADO.
-- Nadie las ve con un enlace público; la aplicación pide un enlace firmado
-- que caduca, y sólo lo consigue quien pertenece a la organización dueña
-- de la carpeta.
--
-- Ruta de cada archivo: `<organizacion_id>/<cliente_id>/<lado>-<marca>.jpg`.
-- La primera carpeta es la organización, que es lo que filtran las
-- políticas, igual que con los logos. La marca de tiempo hace que al
-- cambiar una foto la ruta cambie y ningún navegador muestre la vieja.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos-clientes',
  'fotos-clientes',
  false,
  5242880, -- 5 MB; la aplicación las reduce a ~300 KB antes de subirlas
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos clientes lectura propia"      on storage.objects;
drop policy if exists "fotos clientes escritura propia"    on storage.objects;
drop policy if exists "fotos clientes actualizacion propia" on storage.objects;
drop policy if exists "fotos clientes borrado propio"      on storage.objects;

create policy "fotos clientes lectura propia" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos-clientes'
    and (storage.foldername(name))[1] = (select public.org_actual())::text
  );

create policy "fotos clientes escritura propia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-clientes'
    and (storage.foldername(name))[1] = (select public.org_actual())::text
  );

create policy "fotos clientes actualizacion propia" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'fotos-clientes'
    and (storage.foldername(name))[1] = (select public.org_actual())::text
  )
  with check (
    bucket_id = 'fotos-clientes'
    and (storage.foldername(name))[1] = (select public.org_actual())::text
  );

create policy "fotos clientes borrado propio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos-clientes'
    and (storage.foldername(name))[1] = (select public.org_actual())::text
  );

-- ---------------------------------------------------------------------
-- Dónde está cada foto
-- ---------------------------------------------------------------------
alter table public.clientes
  add column if not exists foto_cedula_frente text,
  add column if not exists foto_cedula_detras text;

-- Una ruta sólo puede apuntar a la carpeta de ESTE cliente dentro de SU
-- organización: así nadie guarda en su ficha la ruta de la foto de otro.
alter table public.clientes drop constraint if exists chk_clientes_fotos;
alter table public.clientes add constraint chk_clientes_fotos check (
  (foto_cedula_frente is null
    or foto_cedula_frente ~ ('^' || organizacion_id::text || '/' || id::text || '/frente-[0-9]+\.(jpg|png|webp)$'))
  and
  (foto_cedula_detras is null
    or foto_cedula_detras ~ ('^' || organizacion_id::text || '/' || id::text || '/detras-[0-9]+\.(jpg|png|webp)$'))
);

comment on column public.clientes.foto_cedula_frente is
  'Ruta en el bucket privado fotos-clientes de la foto del frente de la cédula.';
comment on column public.clientes.foto_cedula_detras is
  'Ruta en el bucket privado fotos-clientes de la foto de atrás de la cédula.';
