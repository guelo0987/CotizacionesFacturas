process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const url = 'https://hxeovachlapvfubcebha.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4ZW92YWNobGFwdmZ1YmNlYmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODM0NDcsImV4cCI6MjEwMDQ1OTQ0N30.c-CmCmKcqmTksouDUtPeUg2VbLOvRITydY1WwNy81cA';

const endpoints = [
  { name: 'Auth Signup', path: '/auth/v1/signup', method: 'OPTIONS' },
  { name: 'Auth Token', path: '/auth/v1/token', method: 'OPTIONS' },
  { name: 'Table: clientes', path: '/rest/v1/clientes?select=*', method: 'GET' },
  { name: 'Table: servicios', path: '/rest/v1/servicios?select=*', method: 'GET' },
  { name: 'Table: cotizaciones', path: '/rest/v1/cotizaciones?select=*', method: 'GET' },
  { name: 'Table: cotizacion_items', path: '/rest/v1/cotizacion_items?select=*', method: 'GET' },
  { name: 'Table: facturas', path: '/rest/v1/facturas?select=*', method: 'GET' },
  { name: 'Table: factura_items', path: '/rest/v1/factura_items?select=*', method: 'GET' },
  { name: 'Table: prestamos', path: '/rest/v1/prestamos?select=*', method: 'GET' },
  { name: 'Table: cuotas', path: '/rest/v1/cuotas?select=*', method: 'GET' },
  { name: 'Table: pagos', path: '/rest/v1/pagos?select=*', method: 'GET' },
];

async function runEndpointChecks() {
  console.log('=====================================================');
  console.log('🔍 PROBANDO CADA ENDPOINT DE BACKEND EN SUPABASE');
  console.log('=====================================================\n');

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${url}${ep.path}`, {
        method: ep.method,
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });

      const isOk = res.status >= 200 && res.status < 400;
      console.log(`${isOk ? '✅' : '⚠️'} [${res.status}] ${ep.name} -> ${ep.path}`);
    } catch (e: any) {
      console.error(`❌ [ERROR] ${ep.name}:`, e.message);
    }
  }

  console.log('\n=====================================================');
}

runEndpointChecks();
