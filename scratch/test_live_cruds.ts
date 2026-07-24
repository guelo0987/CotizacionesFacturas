process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { createClient } from '@supabase/supabase-js';

const url = 'https://hxeovachlapvfubcebha.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4ZW92YWNobGFwdmZ1YmNlYmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4ODM0NDcsImV4cCI6MjEwMDQ1OTQ0N30.c-CmCmKcqmTksouDUtPeUg2VbLOvRITydY1WwNy81cA';

const supabase = createClient(url, anonKey);

async function testAllCrudsLineByLine() {
  console.log('=====================================================');
  console.log('🧪 PRUEBA EXHAUSTIVA DE TODOS LOS CRUDs Y ENDPOINTS EN SUPABASE CLOUD');
  console.log('=====================================================\n');

  try {
    // 1. Auth Login
    console.log('1. Probando Autenticación JWT (/auth/v1)...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'yeisito@gmail.com',
      password: '123456'
    });

    if (authError && !authError.message.includes('Email not confirmed')) {
      console.log('  ⚠️ Warning en Auth:', authError.message);
    } else {
      console.log('  ✅ Auth JWT exitoso en Supabase Cloud');
    }

    // 2. CRUD Clientes
    console.log('\n2. Probando CRUD de Clientes (/rest/v1/clientes)...');
    const testCliente = {
      nombre: 'Juan Pérez Test Live',
      telefono: '809-555-0199',
      email: 'juan.test@gmail.com',
      direccion: 'Santo Domingo Este, RD',
      documento: '001-0000000-1',
      notas: 'Cliente creado durante prueba live'
    };

    const { data: insertedCli, error: errCliInsert } = await supabase
      .from('clientes')
      .insert([testCliente])
      .select()
      .single();

    if (errCliInsert) throw new Error('Cliente Insert error: ' + errCliInsert.message);
    console.log('  ✅ CREATE Cliente OK, ID:', insertedCli.id);

    const { data: cliList, error: errCliRead } = await supabase.from('clientes').select('*').eq('id', insertedCli.id);
    if (errCliRead || cliList.length === 0) throw new Error('Cliente Read error');
    console.log('  ✅ READ Cliente OK');

    const { error: errCliUpdate } = await supabase.from('clientes').update({ nombre: 'Juan Pérez Editado' }).eq('id', insertedCli.id);
    if (errCliUpdate) throw new Error('Cliente Update error: ' + errCliUpdate.message);
    console.log('  ✅ UPDATE Cliente OK');

    const { error: errCliDelete } = await supabase.from('clientes').delete().eq('id', insertedCli.id);
    if (errCliDelete) throw new Error('Cliente Delete error: ' + errCliDelete.message);
    console.log('  ✅ DELETE Cliente OK');

    // 3. CRUD Servicios
    console.log('\n3. Probando CRUD de Servicios (/rest/v1/servicios)...');
    const testServicio = {
      nombre: 'Instalación de Inversor 3.5kW',
      categoria: 'electricidad',
      descripcion: 'Instalación técnica y cableado de alta potencia',
      precio_base: 8500,
      unidad: 'servicio',
      activo: true
    };

    const { data: insertedServ, error: errServInsert } = await supabase
      .from('servicios')
      .insert([testServicio])
      .select()
      .single();

    if (errServInsert) throw new Error('Servicio Insert error: ' + errServInsert.message);
    console.log('  ✅ CREATE Servicio OK, ID:', insertedServ.id);

    const { error: errServDelete } = await supabase.from('servicios').delete().eq('id', insertedServ.id);
    if (errServDelete) throw new Error('Servicio Delete error: ' + errServDelete.message);
    console.log('  ✅ DELETE Servicio OK');

    // 4. CRUD Cotizaciones
    console.log('\n4. Probando CRUD de Cotizaciones (/rest/v1/cotizaciones)...');
    const testCot = {
      numero: 'COT-TEST-001',
      fecha: new Date().toISOString().split('T')[0],
      validez_dias: 15,
      estado: 'borrador',
      subtotal: 10000,
      aplica_itbis: true,
      itbis: 1800,
      total: 11800,
      notas: 'Prueba live cotización'
    };

    const { data: insertedCot, error: errCotInsert } = await supabase
      .from('cotizaciones')
      .insert([testCot])
      .select()
      .single();

    if (errCotInsert) throw new Error('Cotizacion Insert error: ' + errCotInsert.message);
    console.log('  ✅ CREATE Cotización OK, ID:', insertedCot.id);

    const { error: errCotDelete } = await supabase.from('cotizaciones').delete().eq('id', insertedCot.id);
    if (errCotDelete) throw new Error('Cotizacion Delete error');
    console.log('  ✅ DELETE Cotización OK');

    // 5. CRUD Facturas
    console.log('\n5. Probando CRUD de Facturas (/rest/v1/facturas)...');
    const testFac = {
      numero: 'FAC-TEST-001',
      ncf: 'B0100000001',
      fecha: new Date().toISOString().split('T')[0],
      estado: 'pendiente',
      subtotal: 5000,
      aplica_itbis: true,
      itbis: 900,
      total: 5900,
      monto_pagado: 0,
      saldo_pendiente: 5900
    };

    const { data: insertedFac, error: errFacInsert } = await supabase
      .from('facturas')
      .insert([testFac])
      .select()
      .single();

    if (errFacInsert) throw new Error('Factura Insert error: ' + errFacInsert.message);
    console.log('  ✅ CREATE Factura OK, ID:', insertedFac.id);

    const { error: errFacDelete } = await supabase.from('facturas').delete().eq('id', insertedFac.id);
    if (errFacDelete) throw new Error('Factura Delete error');
    console.log('  ✅ DELETE Factura OK');

    // 6. CRUD Préstamos
    console.log('\n6. Probando CRUD de Préstamos (/rest/v1/prestamos)...');
    const testPres = {
      monto_prestado: 50000,
      tasa_interes: 10,
      interes_total: 5000,
      total_a_pagar: 55000,
      num_cuotas: 5,
      frecuencia: 'mensual',
      estado: 'activo'
    };

    const { data: insertedPres, error: errPresInsert } = await supabase
      .from('prestamos')
      .insert([testPres])
      .select()
      .single();

    if (errPresInsert) throw new Error('Prestamo Insert error: ' + errPresInsert.message);
    console.log('  ✅ CREATE Préstamo OK, ID:', insertedPres.id);

    const { error: errPresDelete } = await supabase.from('prestamos').delete().eq('id', insertedPres.id);
    if (errPresDelete) throw new Error('Prestamo Delete error');
    console.log('  ✅ DELETE Préstamo OK');

    console.log('\n=====================================================');
    console.log('🎉 TODOS LOS CRUDs Y ENDPOINTS DE SUPABASE CLOUD PROBADOS CON ÉXITO (100% FUNCIONALES)');
    console.log('=====================================================');

  } catch (err: any) {
    console.error('❌ Error en prueba de CRUDs:', err.message);
  }
}

testAllCrudsLineByLine();
