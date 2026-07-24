process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createClient } from '@supabase/supabase-js';

const url = 'https://hxeovachlapvfubcebha.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4ZW92YWNobGFwdmZ1YmNlYmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODM0NDcsImV4cCI6MjEwMDQ1OTQ0N30.c-CmCmKcqmTksouDUtPeUg2VbLOvRITydY1WwNy81cA';

const supabase = createClient(url, anonKey);

const sql = `
drop policy if exists "Acceso completo clientes" on public.clientes;
drop policy if exists "Acceso completo servicios" on public.servicios;
drop policy if exists "Acceso completo cotizaciones" on public.cotizaciones;
drop policy if exists "Acceso completo facturas" on public.facturas;
drop policy if exists "Acceso completo prestamos" on public.prestamos;

create policy "Permitir todo clientes" on public.clientes for all using (true) with check (true);
create policy "Permitir todo servicios" on public.servicios for all using (true) with check (true);
create policy "Permitir todo cotizaciones" on public.cotizaciones for all using (true) with check (true);
create policy "Permitir todo cotizacion_items" on public.cotizacion_items for all using (true) with check (true);
create policy "Permitir todo facturas" on public.facturas for all using (true) with check (true);
create policy "Permitir todo factura_items" on public.factura_items for all using (true) with check (true);
create policy "Permitir todo prestamos" on public.prestamos for all using (true) with check (true);
create policy "Permitir todo cuotas" on public.cuotas for all using (true) with check (true);
create policy "Permitir todo pagos" on public.pagos for all using (true) with check (true);
`;

console.log('SQL Policy fix prepared.');
