import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import type {
  AppState,
  TabType,
  Cliente,
  Servicio,
  Cotizacion,
  Factura,
  Prestamo,
  Pago,
  BusinessSettings,
  MetodoPago,
  EstadoPrestamo,
} from './types';
import { getInitialState, saveStateToStorage } from './services/store';
import { getSupabaseClient } from './services/supabaseClient';
import { supabaseDataService } from './services/supabaseDataService';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { ClientsView } from './components/ClientsView';
import { DocumentsView } from './components/DocumentsView';
import { LoansView } from './components/LoansView';
import { SettingsModal } from './components/SettingsModal';
import { LoginView } from './components/LoginView';
import { TutorialModal } from './components/TutorialModal';
import { roundMoney } from './utils/sanitizer';

// Vercel Bundle Optimization: Lazy load heavy PDF component
const PdfModal = lazy(() =>
  import('./components/PdfModal').then((module) => ({ default: module.PdfModal }))
);

export function App() {
  const [state, setState] = useState<AppState>(getInitialState);
  const [activeTab, setActiveTab] = useState<TabType>('inicio');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  // Modals & Tutorial state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [pdfPreviewData, setPdfPreviewData] = useState<{
    type: 'cotizacion' | 'factura';
    doc: Cotizacion | Factura;
  } | null>(null);

  // Auto-save to LocalStorage
  useEffect(() => {
    saveStateToStorage(state);
  }, [state]);

  // OWASP Security & JWT Session Listener
  useEffect(() => {
    const supabase = getSupabaseClient(state.settings.supabase_url, state.settings.supabase_anon_key);
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        setIsLoggedIn(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) setIsLoggedIn(true);
      } else if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [state.settings.supabase_url, state.settings.supabase_anon_key]);

  // Fetch Live Supabase Cloud Database Data when Logged In
  useEffect(() => {
    if (!isLoggedIn) return;

    let isMounted = true;
    async function loadCloudData() {
      setLoadingData(true);
      try {
        const [cli, serv, cot, fac, pres, pag] = await Promise.all([
          supabaseDataService.fetchClientes(),
          supabaseDataService.fetchServicios(),
          supabaseDataService.fetchCotizaciones(),
          supabaseDataService.fetchFacturas(),
          supabaseDataService.fetchPrestamos(),
          supabaseDataService.fetchPagos(),
        ]);

        if (isMounted) {
          setState((prev) => ({
            ...prev,
            clientes: cli.length > 0 ? cli : prev.clientes,
            servicios: serv.length > 0 ? serv : prev.servicios,
            cotizaciones: cot.length > 0 ? cot : prev.cotizaciones,
            facturas: fac.length > 0 ? fac : prev.facturas,
            prestamos: pres.length > 0 ? pres : prev.prestamos,
            pagos: pag.length > 0 ? pag : prev.pagos,
          }));
        }
      } catch (e) {
        console.error('Error fetching Supabase cloud data:', e);
      } finally {
        if (isMounted) setLoadingData(false);
      }
    }

    loadCloudData();
    return () => {
      isMounted = false;
    };
  }, [isLoggedIn]);

  // Vercel React Best Practices: O(1) Map for client lookups
  const clienteMap = useMemo(() => {
    const map = new Map<string, Cliente>();
    state.clientes.forEach((c) => map.set(c.id, c));
    return map;
  }, [state.clientes]);

  const handleSuccessLogin = (_email: string) => {
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    const supabase = getSupabaseClient(state.settings.supabase_url, state.settings.supabase_anon_key);
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error('Error signing out session', e);
      }
    }
    setIsLoggedIn(false);
  };

  // --- Handlers: Clientes ---
  const handleAddCliente = async (clienteData: Omit<Cliente, 'id' | 'created_at'>) => {
    const created = await supabaseDataService.createCliente(clienteData);
    const newCliente: Cliente = created || {
      ...clienteData,
      id: `cli-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      clientes: [newCliente, ...prev.clientes],
    }));
  };

  const handleUpdateCliente = async (updatedCliente: Cliente) => {
    await supabaseDataService.updateCliente(updatedCliente.id, updatedCliente);
    setState((prev) => ({
      ...prev,
      clientes: prev.clientes.map((c) => (c.id === updatedCliente.id ? updatedCliente : c)),
    }));
  };

  const handleDeleteCliente = async (id: string) => {
    await supabaseDataService.deleteCliente(id);
    setState((prev) => ({
      ...prev,
      clientes: prev.clientes.filter((c) => c.id !== id),
    }));
  };

  // --- Handlers: Servicios ---
  const handleAddServicio = async (servicioData: Omit<Servicio, 'id' | 'created_at'>) => {
    const created = await supabaseDataService.createServicio(servicioData);
    const newServicio: Servicio = created || {
      ...servicioData,
      id: `serv-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      servicios: [newServicio, ...prev.servicios],
    }));
  };

  const handleUpdateServicio = async (updatedServicio: Servicio) => {
    await supabaseDataService.updateServicio(updatedServicio.id, updatedServicio);
    setState((prev) => ({
      ...prev,
      servicios: prev.servicios.map((s) => (s.id === updatedServicio.id ? updatedServicio : s)),
    }));
  };

  const handleDeleteServicio = async (id: string) => {
    await supabaseDataService.deleteServicio(id);
    setState((prev) => ({
      ...prev,
      servicios: prev.servicios.filter((s) => s.id !== id),
    }));
  };

  // --- Handlers: Cotizaciones ---
  const handleAddCotizacion = async (cotData: Omit<Cotizacion, 'id' | 'created_at'>) => {
    const created = await supabaseDataService.createCotizacion(cotData);
    const newCot: Cotizacion = created || {
      ...cotData,
      id: `cot-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      cotizaciones: [newCot, ...prev.cotizaciones],
    }));
  };

  const handleUpdateCotizacion = async (updatedCot: Cotizacion) => {
    await supabaseDataService.updateCotizacion(updatedCot.id, updatedCot);
    setState((prev) => ({
      ...prev,
      cotizaciones: prev.cotizaciones.map((c) => (c.id === updatedCot.id ? updatedCot : c)),
    }));
  };

  const handleDeleteCotizacion = async (id: string) => {
    await supabaseDataService.deleteCotizacion(id);
    setState((prev) => ({
      ...prev,
      cotizaciones: prev.cotizaciones.filter((c) => c.id !== id),
    }));
  };

  // --- Handlers: Facturas & Pagos ---
  const handleAddFactura = async (facData: Omit<Factura, 'id' | 'created_at'>) => {
    const created = await supabaseDataService.createFactura(facData);
    const newFac: Factura = created || {
      ...facData,
      id: `fac-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      facturas: [newFac, ...prev.facturas],
    }));
  };

  const handleUpdateFactura = async (updatedFac: Factura) => {
    await supabaseDataService.updateFactura(updatedFac.id, updatedFac);
    setState((prev) => ({
      ...prev,
      facturas: prev.facturas.map((f) => (f.id === updatedFac.id ? updatedFac : f)),
    }));
  };

  const handleDeleteFactura = async (id: string) => {
    await supabaseDataService.deleteFactura(id);
    setState((prev) => ({
      ...prev,
      facturas: prev.facturas.filter((f) => f.id !== id),
    }));
  };

  const handleRegisterPago = async (pagoData: {
    factura_id: string;
    monto: number;
    metodo: MetodoPago;
    referencia?: string;
  }) => {
    const createdPago = await supabaseDataService.createPago({
      factura_id: pagoData.factura_id,
      monto: pagoData.monto,
      fecha: new Date().toISOString(),
      metodo: pagoData.metodo,
      referencia: pagoData.referencia,
    });

    const newPago: Pago = createdPago || {
      id: `pago-${Date.now()}`,
      factura_id: pagoData.factura_id,
      monto: pagoData.monto,
      fecha: new Date().toISOString(),
      metodo: pagoData.metodo,
      referencia: pagoData.referencia,
      created_at: new Date().toISOString(),
    };

    setState((prev) => {
      const targetFactura = prev.facturas.find((f) => f.id === pagoData.factura_id);
      if (!targetFactura) return prev;

      const newMontoPagado = roundMoney(targetFactura.monto_pagado + pagoData.monto);
      const newSaldoPendiente = roundMoney(Math.max(0, targetFactura.total - newMontoPagado));

      const newEstado =
        newSaldoPendiente === 0
          ? 'pagada'
          : newMontoPagado > 0
          ? 'parcial'
          : 'pendiente';

      const updatedFactura: Factura = {
        ...targetFactura,
        monto_pagado: newMontoPagado,
        saldo_pendiente: newSaldoPendiente,
        estado: newEstado,
        pagos: [...(targetFactura.pagos || []), newPago],
      };

      supabaseDataService.updateFactura(updatedFactura.id, updatedFactura);

      return {
        ...prev,
        pagos: [newPago, ...prev.pagos],
        facturas: prev.facturas.map((f) => (f.id === targetFactura.id ? updatedFactura : f)),
      };
    });
  };

  // --- Handlers: Préstamos ---
  const handleAddPrestamo = async (presData: Omit<Prestamo, 'id' | 'created_at'>) => {
    const created = await supabaseDataService.createPrestamo(presData);
    const prestamoId = created?.id || `pres-${Date.now()}`;
    const updatedCuotas = presData.cuotas?.map((c) => ({ ...c, prestamo_id: prestamoId }));

    const newPrestamo: Prestamo = {
      ...presData,
      id: prestamoId,
      cuotas: updatedCuotas,
      created_at: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      prestamos: [newPrestamo, ...prev.prestamos],
    }));
  };

  const handleUpdateCuotaEstado = (
    prestamoId: string,
    cuotaId: string,
    montoPagado: number
  ) => {
    setState((prev) => {
      const updatedPrestamos: Prestamo[] = prev.prestamos.map((p) => {
        if (p.id !== prestamoId) return p;

        const updatedCuotas = p.cuotas?.map((c) => {
          if (c.id !== cuotaId) return c;
          return {
            ...c,
            monto_pagado: montoPagado,
            estado: 'pagada' as const,
          };
        });

        const allPaid = updatedCuotas?.every((c) => c.estado === 'pagada');
        const hasOverdue = updatedCuotas?.some(
          (c) =>
            c.estado !== 'pagada' &&
            new Date(c.fecha_vencimiento).getTime() < new Date().setHours(0, 0, 0, 0)
        );

        const newEstado: EstadoPrestamo = allPaid ? 'saldado' : hasOverdue ? 'atrasado' : 'activo';

        return {
          ...p,
          estado: newEstado,
          cuotas: updatedCuotas,
        };
      });

      return {
        ...prev,
        prestamos: updatedPrestamos,
      };
    });
  };

  const handleDeletePrestamo = async (id: string) => {
    await supabaseDataService.deletePrestamo(id);
    setState((prev) => ({
      ...prev,
      prestamos: prev.prestamos.filter((p) => p.id !== id),
    }));
  };

  const handleSaveSettings = (newSettings: BusinessSettings) => {
    setState((prev) => ({ ...prev, settings: newSettings }));
  };

  // STRICT AUTH GUARD: Require login before accessing application
  if (!isLoggedIn) {
    return <LoginView settings={state.settings} onSuccessLogin={handleSuccessLogin} />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans">
      <Header
        settings={state.settings}
        isLoggedIn={isLoggedIn}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTutorial={() => setIsTutorialOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-20">
        {loadingData ? (
          <div className="text-center py-12 text-slate-500 text-xs font-semibold">
            Sincronizando datos con Supabase Cloud...
          </div>
        ) : null}

        {activeTab === 'inicio' ? (
          <DashboardView
            state={state}
            onNavigateTab={setActiveTab}
            onOpenNewQuote={() => setActiveTab('documentos')}
            onOpenNewInvoice={() => setActiveTab('documentos')}
            onOpenNewLoan={() => setActiveTab('prestamos')}
            onOpenNewClient={() => setActiveTab('clientes')}
          />
        ) : null}

        {activeTab === 'clientes' ? (
          <ClientsView
            state={state}
            onAddCliente={handleAddCliente}
            onUpdateCliente={handleUpdateCliente}
            onDeleteCliente={handleDeleteCliente}
          />
        ) : null}

        {activeTab === 'documentos' ? (
          <DocumentsView
            state={state}
            onAddCotizacion={handleAddCotizacion}
            onUpdateCotizacion={handleUpdateCotizacion}
            onDeleteCotizacion={handleDeleteCotizacion}
            onAddFactura={handleAddFactura}
            onUpdateFactura={handleUpdateFactura}
            onDeleteFactura={handleDeleteFactura}
            onRegisterPago={handleRegisterPago}
            onOpenPdfPreview={(type, doc) => setPdfPreviewData({ type, doc })}
          />
        ) : null}

        {activeTab === 'prestamos' ? (
          <LoansView
            state={state}
            onAddPrestamo={handleAddPrestamo}
            onUpdateCuotaEstado={handleUpdateCuotaEstado}
            onDeletePrestamo={handleDeletePrestamo}
          />
        ) : null}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {isSettingsOpen ? (
        <SettingsModal
          state={state}
          onSaveSettings={handleSaveSettings}
          onClose={() => setIsSettingsOpen(false)}
          onAddServicio={handleAddServicio}
          onUpdateServicio={handleUpdateServicio}
          onDeleteServicio={handleDeleteServicio}
        />
      ) : null}

      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
      />

      {pdfPreviewData ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center text-white text-sm font-semibold">
              Cargando generador de PDF...
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
