process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Client } from 'pg';

const connectionString = 'postgresql://postgres:Razerteam2004%2A@db.hxeovachlapvfubcebha.supabase.co:5432/postgres';

const sql = `
drop policy if exists "Acceso completo clientes" on public.clientes;
drop policy if exists "Acceso completo servicios" on public.servicios;
drop policy if exists "Acceso completo cotizaciones" on public.cotizaciones;
drop policy if exists "Acceso completo facturas" on public.facturas;
drop policy if exists "Acceso completo prestamos" on public.prestamos;

drop policy if exists "Permitir todo clientes" on public.clientes;
drop policy if exists "Permitir todo servicios" on public.servicios;
drop policy if exists "Permitir todo cotizaciones" on public.cotizaciones;
drop policy if exists "Permitir todo cotizacion_items" on public.cotizacion_items;
drop policy if exists "Permitir todo facturas" on public.facturas;
drop policy if exists "Permitir todo factura_items" on public.factura_items;
drop policy if exists "Permitir todo prestamos" on public.prestamos;
drop policy if exists "Permitir todo cuotas" on public.cuotas;
drop policy if exists "Permitir todo pagos" on public.pagos;

create policy "Permitir todo clientes" on public.clientes for all using (true) with check (true);
create policy "Permitir todo servicios" on public.servicios for all using (true) with check (true);
create policy "Permitir todo cotizaciones" on public.cotizaciones for all using (true) with check (true);
create policy "Permitir todo cotizacion_items" on public.cotizacion_items for all using (true) with check (true);
create policy "Permitir todo facturas" on public.facturas for all using (true) with check (true);
create policy "Permitir todo factura_items" on public.factura_items for all using (true) with check (true);
create policy "Permitir todo prestamos" on public.prestamos for all using (true) with check (true);
create policy "Permitir todo cuotas" on public.cuotas for all using (true) with check (true);
create policy "Permitir todo pagos" on public.pagos for all using (true) with check (true);

grant all on all tables in schema public to anon, authenticated;
`;

async function applySql() {
  console.log('Connecting directly to Supabase Postgres to update RLS policies...');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ RLS policies updated successfully!');
  } catch (err: any) {
    console.error('❌ Error executing SQL:', err.message);
  } finally {
    await client.end();
  }
}

applySql();
