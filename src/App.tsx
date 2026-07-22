import { useState, useEffect } from 'react';
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
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { ClientsView } from './components/ClientsView';
import { DocumentsView } from './components/DocumentsView';
import { LoansView } from './components/LoansView';
import { SettingsModal } from './components/SettingsModal';
import { LoginModal } from './components/LoginModal';
import { PdfModal } from './components/PdfModal';
import { roundMoney } from './utils/sanitizer';

export function App() {
  const [state, setState] = useState<AppState>(getInitialState);
  const [activeTab, setActiveTab] = useState<TabType>('inicio');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [pdfPreviewData, setPdfPreviewData] = useState<{
    type: 'cotizacion' | 'factura';
    doc: Cotizacion | Factura;
  } | null>(null);

  useEffect(() => {
    saveStateToStorage(state);
  }, [state]);

  const handleSuccessLogin = (_email: string) => {
    setIsLoggedIn(true);
  };

  // --- Handlers: Clientes ---
  const handleAddCliente = (clienteData: Omit<Cliente, 'id' | 'created_at'>) => {
    const newCliente: Cliente = {
      ...clienteData,
      id: `cli-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      clientes: [newCliente, ...prev.clientes],
    }));
  };

  const handleUpdateCliente = (updatedCliente: Cliente) => {
    setState((prev) => ({
      ...prev,
      clientes: prev.clientes.map((c) => (c.id === updatedCliente.id ? updatedCliente : c)),
    }));
  };

  const handleDeleteCliente = (id: string) => {
    setState((prev) => ({
      ...prev,
      clientes: prev.clientes.filter((c) => c.id !== id),
    }));
  };

  // --- Handlers: Servicios ---
  const handleAddServicio = (servicioData: Omit<Servicio, 'id' | 'created_at'>) => {
    const newServicio: Servicio = {
      ...servicioData,
      id: `serv-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      servicios: [newServicio, ...prev.servicios],
    }));
  };

  const handleUpdateServicio = (updatedServicio: Servicio) => {
    setState((prev) => ({
      ...prev,
      servicios: prev.servicios.map((s) => (s.id === updatedServicio.id ? updatedServicio : s)),
    }));
  };

  const handleDeleteServicio = (id: string) => {
    setState((prev) => ({
      ...prev,
      servicios: prev.servicios.filter((s) => s.id !== id),
    }));
  };

  // --- Handlers: Cotizaciones ---
  const handleAddCotizacion = (cotData: Omit<Cotizacion, 'id' | 'created_at'>) => {
    const newCot: Cotizacion = {
      ...cotData,
      id: `cot-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      cotizaciones: [newCot, ...prev.cotizaciones],
    }));
  };

  const handleUpdateCotizacion = (updatedCot: Cotizacion) => {
    setState((prev) => ({
      ...prev,
      cotizaciones: prev.cotizaciones.map((c) => (c.id === updatedCot.id ? updatedCot : c)),
    }));
  };

  const handleDeleteCotizacion = (id: string) => {
    setState((prev) => ({
      ...prev,
      cotizaciones: prev.cotizaciones.filter((c) => c.id !== id),
    }));
  };

  // --- Handlers: Facturas & Pagos ---
  const handleAddFactura = (facData: Omit<Factura, 'id' | 'created_at'>) => {
    const newFac: Factura = {
      ...facData,
      id: `fac-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      facturas: [newFac, ...prev.facturas],
    }));
  };

  const handleUpdateFactura = (updatedFac: Factura) => {
    setState((prev) => ({
      ...prev,
      facturas: prev.facturas.map((f) => (f.id === updatedFac.id ? updatedFac : f)),
    }));
  };

  const handleDeleteFactura = (id: string) => {
    setState((prev) => ({
      ...prev,
      facturas: prev.facturas.filter((f) => f.id !== id),
    }));
  };

  const handleRegisterPago = (pagoData: {
    factura_id: string;
    monto: number;
    metodo: MetodoPago;
    referencia?: string;
  }) => {
    const newPago: Pago = {
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

      return {
        ...prev,
        pagos: [newPago, ...prev.pagos],
        facturas: prev.facturas.map((f) => (f.id === targetFactura.id ? updatedFactura : f)),
      };
    });
  };

  // --- Handlers: Préstamos ---
  const handleAddPrestamo = (presData: Omit<Prestamo, 'id' | 'created_at'>) => {
    const prestamoId = `pres-${Date.now()}`;
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

  const handleDeletePrestamo = (id: string) => {
    setState((prev) => ({
      ...prev,
      prestamos: prev.prestamos.filter((p) => p.id !== id),
    }));
  };

  const handleSaveSettings = (newSettings: BusinessSettings) => {
    setState((prev) => ({ ...prev, settings: newSettings }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        settings={state.settings}
        isLoggedIn={isLoggedIn}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLogin={() => setIsLoginOpen(true)}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6">
        {activeTab === 'inicio' && (
          <DashboardView
            state={state}
            onNavigateTab={setActiveTab}
            onOpenNewQuote={() => setActiveTab('documentos')}
            onOpenNewInvoice={() => setActiveTab('documentos')}
            onOpenNewLoan={() => setActiveTab('prestamos')}
            onOpenNewClient={() => setActiveTab('clientes')}
          />
        )}

        {activeTab === 'clientes' && (
          <ClientsView
            state={state}
            onAddCliente={handleAddCliente}
            onUpdateCliente={handleUpdateCliente}
            onDeleteCliente={handleDeleteCliente}
          />
        )}

        {activeTab === 'documentos' && (
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
        )}

        {activeTab === 'prestamos' && (
          <LoansView
            state={state}
            onAddPrestamo={handleAddPrestamo}
            onUpdateCuotaEstado={handleUpdateCuotaEstado}
            onDeletePrestamo={handleDeletePrestamo}
          />
        )}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {isSettingsOpen && (
        <SettingsModal
          state={state}
          onSaveSettings={handleSaveSettings}
          onClose={() => setIsSettingsOpen(false)}
          onAddServicio={handleAddServicio}
          onUpdateServicio={handleUpdateServicio}
          onDeleteServicio={handleDeleteServicio}
        />
      )}

      {isLoginOpen && (
        <LoginModal
          settings={state.settings}
          onSuccessLogin={handleSuccessLogin}
          onClose={() => setIsLoginOpen(false)}
        />
      )}

      {pdfPreviewData && (
        <PdfModal
          type={pdfPreviewData.type}
          doc={pdfPreviewData.doc}
          cliente={state.clientes.find((c) => c.id === pdfPreviewData.doc.cliente_id)}
          settings={state.settings}
          onClose={() => setPdfPreviewData(null)}
        />
      )}
    </div>
  );
}

export default App;
