import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import type { Session } from '@supabase/supabase-js';
import type {
  AppState,
  BusinessSettings,
  Cliente,
  Cotizacion,
  Factura,
  LineaDocumento,
  MetodoPago,
  Prestamo,
  Servicio,
  TabType,
} from './types';
import { ESTADO_VACIO, guardarCache, leerCache, limpiarCache } from './services/store';
import { configuracionCompleta, getSupabaseClient } from './services/supabaseClient';
import { supabaseDataService } from './services/supabaseDataService';
import { calcularPrestamo, modalidadSegura } from './utils/calculos';
import { formatCurrency } from './utils/sanitizer';
import { useFeedback, mensajeDeError } from './components/feedback/contexto';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { ClientsView } from './components/ClientsView';
import { DocumentsView } from './components/DocumentsView';
import { LoansView } from './components/LoansView';
import { SettingsModal } from './components/SettingsModal';
import { LoginView } from './components/LoginView';
import { OnboardingView } from './components/OnboardingView';
import { ConfiguracionFaltanteView } from './components/ConfiguracionFaltanteView';
import { TutorialModal } from './components/TutorialModal';
import { ReportesModal } from './components/ReportesModal';

const PdfModal = lazy(() =>
  import('./components/PdfModal').then((module) => ({ default: module.PdfModal }))
);

/** Señal para que una vista abra su formulario de alta al llegar desde el panel. */
export interface SolicitudApertura {
  destino: 'cotizacion' | 'factura' | 'prestamo' | 'cliente';
  nonce: number;
}

type EstadoSesion = 'cargando' | 'anonimo' | 'sin-organizacion' | 'listo';

export function App() {
  const { exito, error: avisarError, confirmar } = useFeedback();

  const [state, setState] = useState<AppState>(ESTADO_VACIO);
  const [activeTab, setActiveTab] = useState<TabType>('inicio');
  const [estadoSesion, setEstadoSesion] = useState<EstadoSesion>(
    configuracionCompleta ? 'cargando' : 'anonimo'
  );
  const [sesion, setSesion] = useState<Session | null>(null);
  const [organizacionId, setOrganizacionId] = useState<string | null>(null);
  const [cargandoDatos, setCargandoDatos] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isReportesOpen, setIsReportesOpen] = useState(false);
  const [solicitud, setSolicitud] = useState<SolicitudApertura | null>(null);
  const [pdfPreviewData, setPdfPreviewData] = useState<{
    type: 'cotizacion' | 'factura';
    doc: Cotizacion | Factura;
  } | null>(null);

  // -------------------------------------------------------------------
  // Sesión
  // -------------------------------------------------------------------
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      if (!data.session) setEstadoSesion('anonimo');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      setSesion(nuevaSesion);
      if (evento === 'SIGNED_OUT' || !nuevaSesion) {
        setEstadoSesion('anonimo');
        setOrganizacionId(null);
        setState(ESTADO_VACIO);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Resolver la organización del usuario autenticado
  useEffect(() => {
    if (!sesion?.user) return;

    let vigente = true;
    (async () => {
      try {
        const perfil = await supabaseDataService.obtenerPerfil();
        if (!vigente) return;

        if (!perfil) {
          setEstadoSesion('sin-organizacion');
          return;
        }
        setOrganizacionId(perfil.organizacion_id);
        setEstadoSesion('listo');
      } catch (e) {
        if (!vigente) return;
        avisarError(mensajeDeError(e));
        setEstadoSesion('sin-organizacion');
      }
    })();

    return () => {
      vigente = false;
    };
  }, [sesion, avisarError]);

  // -------------------------------------------------------------------
  // Carga de datos
  // -------------------------------------------------------------------
  const recargarTodo = useCallback(
    async (mostrarCargando = true) => {
      if (!sesion?.user) return;
      if (mostrarCargando) setCargandoDatos(true);

      try {
        // Antes de leer: marcar cuotas vencidas y vencer cotizaciones caducadas.
        // Sin esto el contador de atrasos del panel se quedaba siempre en cero.
        await supabaseDataService.actualizarAtrasos();

        const [config, clientes, servicios, cotizaciones, facturas, prestamos, pagos] =
          await Promise.all([
            supabaseDataService.fetchConfiguracion(),
            supabaseDataService.fetchClientes(),
            supabaseDataService.fetchServicios(),
            supabaseDataService.fetchCotizaciones(),
            supabaseDataService.fetchFacturas(),
            supabaseDataService.fetchPrestamos(),
            supabaseDataService.fetchPagos(),
          ]);

        // Se confía en lo que devuelve el servidor. El patrón anterior
        // (`datos.length > 0 ? datos : anterior`) resucitaba registros ya
        // borrados y mezclaba los datos de sesiones distintas.
        setState((prev) => ({
          settings: config ?? prev.settings,
          clientes,
          servicios,
          cotizaciones,
          facturas,
          prestamos,
          pagos,
        }));
      } catch (e) {
        avisarError(mensajeDeError(e));
      } finally {
        if (mostrarCargando) setCargandoDatos(false);
      }
    },
    [sesion, avisarError]
  );

  useEffect(() => {
    if (estadoSesion !== 'listo' || !sesion?.user) return;

    // Pintar de inmediato lo que haya en caché mientras llega el servidor
    const cache = leerCache(sesion.user.id);
    if (cache) setState(cache);

    void recargarTodo(!cache);
  }, [estadoSesion, sesion, recargarTodo]);

  // Caché local (sólo lectura rápida; la fuente de verdad es el servidor)
  useEffect(() => {
    if (estadoSesion !== 'listo' || !sesion?.user) return;
    guardarCache(sesion.user.id, state);
  }, [state, estadoSesion, sesion]);

  const clienteMap = useMemo(() => {
    const map = new Map<string, Cliente>();
    state.clientes.forEach((c) => map.set(c.id, c));
    return map;
  }, [state.clientes]);

  // -------------------------------------------------------------------
  // Sesión: entrada y salida
  // -------------------------------------------------------------------
  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    const userId = sesion?.user?.id;
    try {
      await supabase?.auth.signOut();
    } catch (e) {
      avisarError(mensajeDeError(e));
    }
    limpiarCache(userId);
    setState(ESTADO_VACIO);
    setOrganizacionId(null);
    setActiveTab('inicio');
    setEstadoSesion('anonimo');
  };

  const handleOrganizacionCreada = async () => {
    try {
      const perfil = await supabaseDataService.obtenerPerfil();
      if (perfil) {
        setOrganizacionId(perfil.organizacion_id);
        setEstadoSesion('listo');
        exito('¡Tu negocio quedó registrado! Ya puedes empezar.');
      }
    } catch (e) {
      avisarError(mensajeDeError(e));
    }
  };

  // -------------------------------------------------------------------
  // Clientes
  // -------------------------------------------------------------------
  const handleAddCliente = async (datos: Omit<Cliente, 'id' | 'created_at' | 'activo'>) => {
    const creado = await supabaseDataService.createCliente(datos);
    setState((prev) => ({
      ...prev,
      clientes: [...prev.clientes, creado].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }));
    exito(`Cliente "${creado.nombre}" creado.`);
  };

  const handleUpdateCliente = async (cliente: Cliente) => {
    const actualizado = await supabaseDataService.updateCliente(cliente.id, cliente);
    setState((prev) => ({
      ...prev,
      clientes: prev.clientes
        .map((c) => (c.id === actualizado.id ? actualizado : c))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }));
    exito('Cliente actualizado.');
  };

  const handleDeleteCliente = async (id: string) => {
    const cliente = clienteMap.get(id);
    const historial = await supabaseDataService.contarHistorialCliente(id);
    const total = historial.cotizaciones + historial.facturas + historial.prestamos;

    const confirmado = await confirmar({
      titulo: total > 0 ? 'Este cliente tiene historial' : 'Eliminar cliente',
      mensaje:
        total > 0
          ? `${cliente?.nombre ?? 'El cliente'} se desactivará para conservar su historial fiscal. Dejará de aparecer en los listados, pero sus documentos se mantienen.`
          : `¿Eliminar a ${cliente?.nombre ?? 'este cliente'}? Esta acción no se puede deshacer.`,
      detalle:
        total > 0
          ? `Documentos vinculados:\n· ${historial.cotizaciones} cotizaciones\n· ${historial.facturas} facturas\n· ${historial.prestamos} préstamos`
          : undefined,
      textoConfirmar: total > 0 ? 'Desactivar' : 'Eliminar',
      peligroso: true,
    });

    if (!confirmado) return;

    const resultado = await supabaseDataService.deleteCliente(id);
    if (resultado === 'eliminado') {
      setState((prev) => ({ ...prev, clientes: prev.clientes.filter((c) => c.id !== id) }));
      exito('Cliente eliminado.');
    } else {
      setState((prev) => ({
        ...prev,
        clientes: prev.clientes.map((c) => (c.id === id ? { ...c, activo: false } : c)),
      }));
      exito('Cliente desactivado. Su historial se conserva.');
    }
  };

  // -------------------------------------------------------------------
  // Servicios
  // -------------------------------------------------------------------
  const handleAddServicio = async (datos: Omit<Servicio, 'id' | 'created_at'>) => {
    const creado = await supabaseDataService.createServicio(datos);
    setState((prev) => ({
      ...prev,
      servicios: [...prev.servicios, creado].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }));
    exito(`Servicio "${creado.nombre}" creado.`);
  };

  const handleUpdateServicio = async (servicio: Servicio) => {
    const actualizado = await supabaseDataService.updateServicio(servicio.id, servicio);
    setState((prev) => ({
      ...prev,
      servicios: prev.servicios.map((s) => (s.id === actualizado.id ? actualizado : s)),
    }));
  };

  const handleDeleteServicio = async (id: string) => {
    const servicio = state.servicios.find((s) => s.id === id);
    const confirmado = await confirmar({
      titulo: 'Eliminar servicio',
      mensaje: `¿Eliminar "${servicio?.nombre ?? 'este servicio'}" del catálogo? Los documentos ya emitidos no se modifican.`,
      textoConfirmar: 'Eliminar',
      peligroso: true,
    });
    if (!confirmado) return;

    await supabaseDataService.deleteServicio(id);
    setState((prev) => ({ ...prev, servicios: prev.servicios.filter((s) => s.id !== id) }));
    exito('Servicio eliminado.');
  };

  // -------------------------------------------------------------------
  // Cotizaciones
  // -------------------------------------------------------------------
  const handleGuardarCotizacion = async (
    datos: Partial<Cotizacion> & { cliente_id: string },
    items: LineaDocumento[]
  ) => {
    const guardada = await supabaseDataService.guardarCotizacion(datos, items);
    setState((prev) => {
      const existe = prev.cotizaciones.some((c) => c.id === guardada.id);
      return {
        ...prev,
        cotizaciones: existe
          ? prev.cotizaciones.map((c) => (c.id === guardada.id ? guardada : c))
          : [guardada, ...prev.cotizaciones],
      };
    });
    exito(datos.id ? `Cotización ${guardada.numero} actualizada.` : `Cotización ${guardada.numero} creada.`);
  };

  const handleDeleteCotizacion = async (cot: Cotizacion) => {
    const confirmado = await confirmar({
      titulo: 'Eliminar cotización',
      mensaje: `¿Eliminar la cotización ${cot.numero}? Se borrarán también sus líneas de detalle.`,
      textoConfirmar: 'Eliminar',
      peligroso: true,
    });
    if (!confirmado) return;

    await supabaseDataService.deleteCotizacion(cot.id);
    setState((prev) => ({
      ...prev,
      cotizaciones: prev.cotizaciones.filter((c) => c.id !== cot.id),
    }));
    exito('Cotización eliminada.');
  };

  const handleConvertirEnFactura = async (cot: Cotizacion) => {
    const confirmado = await confirmar({
      titulo: 'Convertir en factura',
      mensaje: `Se creará una factura con las mismas líneas de ${cot.numero} y la cotización quedará marcada como aceptada.`,
      textoConfirmar: 'Convertir',
    });
    if (!confirmado) return;

    const factura = await supabaseDataService.convertirEnFactura(cot.id);
    setState((prev) => ({
      ...prev,
      facturas: [factura, ...prev.facturas],
      cotizaciones: prev.cotizaciones.map((c) =>
        c.id === cot.id ? { ...c, estado: 'aceptada' as const } : c
      ),
    }));
    exito(`Factura ${factura.numero} creada desde ${cot.numero}.`);
  };

  // -------------------------------------------------------------------
  // Facturas y pagos
  // -------------------------------------------------------------------
  const handleGuardarFactura = async (
    datos: Partial<Factura> & { cliente_id: string },
    items: LineaDocumento[]
  ) => {
    const guardada = await supabaseDataService.guardarFactura(datos, items);
    setState((prev) => {
      const existe = prev.facturas.some((f) => f.id === guardada.id);
      return {
        ...prev,
        facturas: existe
          ? prev.facturas.map((f) => (f.id === guardada.id ? guardada : f))
          : [guardada, ...prev.facturas],
      };
    });
    exito(datos.id ? `Factura ${guardada.numero} actualizada.` : `Factura ${guardada.numero} creada.`);
  };

  const handleDeleteFactura = async (fac: Factura) => {
    const confirmado = await confirmar({
      titulo: 'Eliminar factura',
      mensaje: `¿Eliminar la factura ${fac.numero}?`,
      detalle:
        fac.monto_pagado > 0
          ? 'Atención: esta factura tiene pagos registrados. Al eliminarla se borra también el registro de esos cobros.'
          : undefined,
      textoConfirmar: 'Eliminar',
      peligroso: true,
    });
    if (!confirmado) return;

    await supabaseDataService.deleteFactura(fac.id);
    setState((prev) => ({
      ...prev,
      facturas: prev.facturas.filter((f) => f.id !== fac.id),
      pagos: prev.pagos.filter((p) => p.factura_id !== fac.id),
    }));
    exito('Factura eliminada.');
  };

  const handleRegistrarPagoFactura = async (datos: {
    factura_id: string;
    monto: number;
    metodo: MetodoPago;
    referencia?: string;
  }) => {
    const actualizada = await supabaseDataService.registrarPagoFactura(
      datos.factura_id,
      datos.monto,
      datos.metodo,
      datos.referencia
    );

    setState((prev) => ({
      ...prev,
      facturas: prev.facturas.map((f) => (f.id === actualizada.id ? actualizada : f)),
      pagos: [...(actualizada.pagos ?? []), ...prev.pagos.filter((p) => p.factura_id !== actualizada.id)],
    }));

    exito(
      actualizada.saldo_pendiente <= 0
        ? `Factura ${actualizada.numero} saldada por completo.`
        : `Pago registrado. Queda pendiente ${actualizada.saldo_pendiente.toFixed(2)}.`
    );
  };

  // -------------------------------------------------------------------
  // Préstamos
  // -------------------------------------------------------------------
  const handleGuardarPrestamo = async (datos: Partial<Prestamo> & { cliente_id: string }) => {
    const guardado = await supabaseDataService.guardarPrestamo(datos);
    setState((prev) => {
      const existe = prev.prestamos.some((p) => p.id === guardado.id);
      return {
        ...prev,
        prestamos: existe
          ? prev.prestamos.map((p) => (p.id === guardado.id ? guardado : p))
          : [guardado, ...prev.prestamos],
      };
    });

    // Red de seguridad: si la base de datos todavía no tiene la migración
    // del interés por periodo, guardaría un interés distinto al que se
    // mostró en pantalla. Mejor decirlo que dejar pasar un préstamo con
    // números que no cuadran.
    const esperado = calcularPrestamo(
      Number(datos.monto_prestado) || 0,
      Number(datos.tasa_interes) || 0,
      Number(datos.num_cuotas) || 1,
      modalidadSegura(datos.modalidad_interes)
    ).interesTotal;

    if (Math.abs(Number(guardado.interes_total) - esperado) > 0.01) {
      avisarError(
        `El préstamo se guardó, pero el servidor calculó ${formatCurrency(
          guardado.interes_total
        )} de interés en vez de ${formatCurrency(esperado)}. ` +
          'Falta aplicar la migración de interés por periodo en la base de datos.'
      );
      return;
    }

    exito(datos.id ? 'Préstamo actualizado.' : 'Préstamo creado con su calendario de cuotas.');
  };

  const handleRegistrarPagoCuota = async (
    cuotaId: string,
    monto: number,
    metodo: MetodoPago,
    referencia?: string
  ) => {
    const actualizado = await supabaseDataService.registrarPagoCuota(
      cuotaId,
      monto,
      metodo,
      referencia
    );

    setState((prev) => ({
      ...prev,
      prestamos: prev.prestamos.map((p) => (p.id === actualizado.id ? actualizado : p)),
      pagos: [
        ...(actualizado.pagos ?? []),
        ...prev.pagos.filter((p) => p.prestamo_id !== actualizado.id),
      ],
    }));

    exito(
      actualizado.estado === 'saldado'
        ? '¡Préstamo saldado por completo!'
        : 'Abono registrado correctamente.'
    );
  };

  const handleDeletePrestamo = async (prestamo: Prestamo) => {
    const pagado = (prestamo.cuotas ?? []).reduce((acc, c) => acc + (c.monto_pagado || 0), 0);
    const confirmado = await confirmar({
      titulo: 'Eliminar préstamo',
      mensaje: '¿Eliminar este préstamo junto con su calendario de cuotas?',
      detalle:
        pagado > 0
          ? `Atención: ya se cobraron ${pagado.toFixed(2)} de este préstamo. Al eliminarlo se pierde el registro de esos abonos.`
          : undefined,
      textoConfirmar: 'Eliminar',
      peligroso: true,
    });
    if (!confirmado) return;

    await supabaseDataService.deletePrestamo(prestamo.id);
    setState((prev) => ({
      ...prev,
      prestamos: prev.prestamos.filter((p) => p.id !== prestamo.id),
      pagos: prev.pagos.filter((p) => p.prestamo_id !== prestamo.id),
    }));
    exito('Préstamo eliminado.');
  };

  // -------------------------------------------------------------------
  // Ajustes
  // -------------------------------------------------------------------
  const handleSaveSettings = async (nuevos: BusinessSettings) => {
    if (!organizacionId) throw new Error('No se pudo identificar tu negocio.');
    const guardados = await supabaseDataService.guardarConfiguracion(organizacionId, nuevos);
    setState((prev) => ({ ...prev, settings: guardados }));
    exito('Perfil del negocio guardado.');
  };

  const handleSubirLogo = async (archivo: File): Promise<string> => {
    if (!organizacionId) throw new Error('No se pudo identificar tu negocio.');
    return supabaseDataService.subirLogo(organizacionId, archivo);
  };

  // -------------------------------------------------------------------
  // Navegación desde las acciones rápidas del panel
  // -------------------------------------------------------------------
  const abrirFormulario = (destino: SolicitudApertura['destino']) => {
    setActiveTab(
      destino === 'cliente' ? 'clientes' : destino === 'prestamo' ? 'prestamos' : 'documentos'
    );
    setSolicitud({ destino, nonce: Date.now() });
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  if (!configuracionCompleta) {
    return <ConfiguracionFaltanteView />;
  }

  if (estadoSesion === 'cargando') {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <p className="text-sm font-semibold text-slate-500">Cargando tu sesión…</p>
      </div>
    );
  }

  if (estadoSesion === 'anonimo') {
    return <LoginView />;
  }

  if (estadoSesion === 'sin-organizacion') {
    return (
      <OnboardingView
        emailUsuario={sesion?.user?.email ?? ''}
        onCreada={handleOrganizacionCreada}
        onCerrarSesion={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans">
      <Header
        settings={state.settings}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTutorial={() => setIsTutorialOpen(true)}
        onOpenReportes={() => setIsReportesOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-24">
        {cargandoDatos ? (
          <div className="text-center py-3 text-slate-500 text-xs font-semibold">
            Sincronizando con la nube…
          </div>
        ) : null}

        {activeTab === 'inicio' ? (
          <DashboardView
            state={state}
            onNavigateTab={setActiveTab}
            onAbrirFormulario={abrirFormulario}
          />
        ) : null}

        {activeTab === 'clientes' ? (
          <ClientsView
            state={state}
            solicitud={solicitud}
            onAddCliente={handleAddCliente}
            onUpdateCliente={handleUpdateCliente}
            onDeleteCliente={handleDeleteCliente}
          />
        ) : null}

        {activeTab === 'documentos' ? (
          <DocumentsView
            state={state}
            solicitud={solicitud}
            onGuardarCotizacion={handleGuardarCotizacion}
            onDeleteCotizacion={handleDeleteCotizacion}
            onConvertirEnFactura={handleConvertirEnFactura}
            onGuardarFactura={handleGuardarFactura}
            onDeleteFactura={handleDeleteFactura}
            onRegistrarPago={handleRegistrarPagoFactura}
            onOpenPdfPreview={(type, doc) => setPdfPreviewData({ type, doc })}
          />
        ) : null}

        {activeTab === 'prestamos' ? (
          <LoansView
            state={state}
            solicitud={solicitud}
            onGuardarPrestamo={handleGuardarPrestamo}
            onRegistrarPagoCuota={handleRegistrarPagoCuota}
            onDeletePrestamo={handleDeletePrestamo}
          />
        ) : null}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {isSettingsOpen ? (
        <SettingsModal
          state={state}
          onSaveSettings={handleSaveSettings}
          onSubirLogo={handleSubirLogo}
          onClose={() => setIsSettingsOpen(false)}
          onAddServicio={handleAddServicio}
          onUpdateServicio={handleUpdateServicio}
          onDeleteServicio={handleDeleteServicio}
        />
      ) : null}

      {isReportesOpen ? (
        <ReportesModal state={state} onClose={() => setIsReportesOpen(false)} />
      ) : null}

      <TutorialModal isOpen={isTutorialOpen} onClose={() => setIsTutorialOpen(false)} />

      {pdfPreviewData ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center text-white text-sm font-semibold">
              Preparando el documento…
            </div>
          }
        >
          <PdfModal
            type={pdfPreviewData.type}
            doc={pdfPreviewData.doc}
            cliente={clienteMap.get(pdfPreviewData.doc.cliente_id)}
            settings={state.settings}
            onClose={() => setPdfPreviewData(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export default App;
