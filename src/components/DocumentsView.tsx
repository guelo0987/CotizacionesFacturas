import React, { useEffect, useMemo, useState } from 'react';
import type {
  AppState,
  Cotizacion,
  Factura,
  LineaDocumento,
  MetodoPago,
  Servicio,
} from '../types';
import type { SolicitudApertura } from '../App';
import { formatCurrency, formatDate } from '../utils/sanitizer';
import { calcularImporteLinea, calcularTotalesDocumento } from '../utils/calculos';
import {
  aNumero,
  limpiarTexto,
  limpiarTextoMultilinea,
  primerError,
  redondearDinero,
  sanearNumero,
  validarCantidad,
  validarFecha,
  validarMonto,
  validarNCF,
  describirNCF,
  validarEntero,
} from '../utils/validacion';
import { useAccionAsync } from '../hooks/useAccionAsync';
import { generateWhatsappQuoteUrl, generateWhatsappInvoiceUrl } from '../utils/whatsapp';
import {
  AlertCircle,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  DollarSign,
  Edit2,
  Eye,
  FileText,
  Plus,
  Search,
  Share2,
  Trash2,
  X,
} from 'lucide-react';

type SubTab = 'cotizaciones' | 'facturas';

interface LineaEditable extends LineaDocumento {
  clave: string;
}

interface DocumentsViewProps {
  state: AppState;
  solicitud: SolicitudApertura | null;
  onGuardarCotizacion: (
    datos: Partial<Cotizacion> & { cliente_id: string },
    items: LineaDocumento[]
  ) => Promise<void>;
  onDeleteCotizacion: (cot: Cotizacion) => Promise<void>;
  onConvertirEnFactura: (cot: Cotizacion) => Promise<void>;
  onGuardarFactura: (
    datos: Partial<Factura> & { cliente_id: string },
    items: LineaDocumento[]
  ) => Promise<void>;
  onDeleteFactura: (fac: Factura) => Promise<void>;
  onRegistrarPago: (pago: {
    factura_id: string;
    monto: number;
    metodo: MetodoPago;
    referencia?: string;
  }) => Promise<void>;
  onOpenPdfPreview: (type: 'cotizacion' | 'factura', doc: Cotizacion | Factura) => void;
}

let contadorClaves = 0;
const nuevaClave = () => `linea-${++contadorClaves}`;

const lineaVacia = (): LineaEditable => ({
  clave: nuevaClave(),
  servicio_id: null,
  descripcion: '',
  cantidad: 1,
  precio_unitario: 0,
  importe: 0,
});

const hoyISO = () => new Date().toISOString().split('T')[0];

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  state,
  solicitud,
  onGuardarCotizacion,
  onDeleteCotizacion,
  onConvertirEnFactura,
  onGuardarFactura,
  onDeleteFactura,
  onRegistrarPago,
  onOpenPdfPreview,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('cotizaciones');
  const [search, setSearch] = useState('');

  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [numeroEditando, setNumeroEditando] = useState<string>('');
  const [errorForm, setErrorForm] = useState('');

  const [formData, setFormData] = useState({
    cliente_id: '',
    fecha: hoyISO(),
    validez_dias: 15,
    ncf: '',
    aplica_itbis: true,
    notas: '',
    items: [lineaVacia()] as LineaEditable[],
  });

  const [pagoFacturaId, setPagoFacturaId] = useState<string | null>(null);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoMetodo, setPagoMetodo] = useState<MetodoPago>('efectivo');
  const [pagoRef, setPagoRef] = useState('');
  const [errorPago, setErrorPago] = useState('');

  const { ejecutando, ejecutar } = useAccionAsync();

  const clientesActivos = useMemo(
    () => state.clientes.filter((c) => c.activo),
    [state.clientes]
  );
  const serviciosActivos = useMemo(
    () => state.servicios.filter((s) => s.activo),
    [state.servicios]
  );

  // La factura del modal de pago se deriva del estado, para que el saldo
  // mostrado sea siempre el actual y no una copia congelada.
  const pagoFactura = useMemo(
    () => state.facturas.find((f) => f.id === pagoFacturaId) ?? null,
    [state.facturas, pagoFacturaId]
  );

  const abrirCreacion = React.useCallback(
    (tipo: SubTab) => {
      setSubTab(tipo);
      setEditandoId(null);
      setNumeroEditando('');
      setErrorForm('');
      setFormData({
        cliente_id: '',
        fecha: hoyISO(),
        validez_dias: 15,
        ncf: '',
        aplica_itbis: true,
        notas: '',
        items: [lineaVacia()],
      });
      setIsDocModalOpen(true);
    },
    []
  );

  // Apertura desde las acciones rápidas del panel
  useEffect(() => {
    if (solicitud?.destino === 'cotizacion') abrirCreacion('cotizaciones');
    else if (solicitud?.destino === 'factura') abrirCreacion('facturas');
  }, [solicitud, abrirCreacion]);

  /** Edición: carga el documento y sus líneas en el formulario. */
  const abrirEdicion = (doc: Cotizacion | Factura, tipo: SubTab) => {
    const factura = tipo === 'facturas' ? (doc as Factura) : null;
    setSubTab(tipo);
    setEditandoId(doc.id);
    setNumeroEditando(doc.numero);
    setErrorForm('');
    setFormData({
      cliente_id: doc.cliente_id,
      fecha: (doc.fecha ?? '').split('T')[0] || hoyISO(),
      validez_dias: (doc as Cotizacion).validez_dias ?? 15,
      ncf: factura?.ncf ?? '',
      aplica_itbis: doc.aplica_itbis,
      notas: doc.notas ?? '',
      items:
        doc.items && doc.items.length > 0
          ? doc.items.map((it) => ({
              clave: nuevaClave(),
              servicio_id: it.servicio_id ?? null,
              descripcion: it.descripcion,
              cantidad: Number(it.cantidad),
              precio_unitario: Number(it.precio_unitario),
              importe: Number(it.importe),
            }))
          : [lineaVacia()],
    });
    setIsDocModalOpen(true);
  };

  // ---------------------------------------------------------------
  // Líneas
  // ---------------------------------------------------------------
  const actualizarLinea = (clave: string, cambios: Partial<LineaEditable>) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.clave !== clave) return it;
        const fusionada = { ...it, ...cambios };
        fusionada.importe = calcularImporteLinea(fusionada.cantidad, fusionada.precio_unitario);
        return fusionada;
      }),
    }));
  };

  const tomarDelCatalogo = (clave: string, servicioId: string) => {
    const s = serviciosActivos.find((serv) => serv.id === servicioId);
    if (!s) return;
    actualizarLinea(clave, {
      servicio_id: s.id,
      descripcion: s.nombre,
      precio_unitario: Number(s.precio_base) || 0,
    });
  };

  const agregarLinea = () =>
    setFormData((prev) => ({ ...prev, items: [...prev.items, lineaVacia()] }));

  const quitarLinea = (clave: string) =>
    setFormData((prev) =>
      prev.items.length === 1
        ? prev
        : { ...prev, items: prev.items.filter((it) => it.clave !== clave) }
    );

  // ---------------------------------------------------------------
  // Totales (previsualización; el servidor recalcula al guardar)
  // ---------------------------------------------------------------
  // Misma fórmula que aplica el servidor al guardar (ver utils/calculos.ts)
  const totales = useMemo(
    () =>
      calcularTotalesDocumento(
        formData.items,
        formData.aplica_itbis,
        state.settings.itbis_rate
      ),
    [formData.items, formData.aplica_itbis, state.settings.itbis_rate]
  );

  // ---------------------------------------------------------------
  // Guardar
  // ---------------------------------------------------------------
  const handleSubmitDocument = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.cliente_id) {
      setErrorForm('Selecciona un cliente.');
      return;
    }

    const validaciones = [
      validarFecha(formData.fecha, 'La fecha del documento'),
      ...(subTab === 'cotizaciones'
        ? [validarEntero(formData.validez_dias, 'La validez en días', 1, 365)]
        : [validarNCF(formData.ncf)]),
    ];

    const falloCabecera = primerError(...validaciones);
    if (falloCabecera) {
      setErrorForm(falloCabecera);
      return;
    }

    // Cada línea debe tener descripción, cantidad y precio válidos
    for (const [i, it] of formData.items.entries()) {
      const descripcion = limpiarTexto(it.descripcion, 300);
      if (!descripcion) {
        setErrorForm(`La línea ${i + 1} necesita una descripción.`);
        return;
      }
      const fallo = primerError(
        validarCantidad(it.cantidad, `La cantidad de la línea ${i + 1}`),
        validarMonto(it.precio_unitario, `El precio de la línea ${i + 1}`, { permitirCero: true })
      );
      if (fallo) {
        setErrorForm(fallo);
        return;
      }
    }

    if (totales.total <= 0) {
      setErrorForm('El documento no puede tener un total de cero.');
      return;
    }

    const items: LineaDocumento[] = formData.items.map((it) => ({
      servicio_id: it.servicio_id || null,
      descripcion: limpiarTexto(it.descripcion, 300),
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      importe: it.importe,
    }));

    const notas = limpiarTextoMultilinea(formData.notas, 1000);

    const ok = await ejecutar(async () => {
      if (subTab === 'cotizaciones') {
        await onGuardarCotizacion(
          {
            id: editandoId ?? undefined,
            cliente_id: formData.cliente_id,
            fecha: formData.fecha,
            validez_dias: formData.validez_dias,
            aplica_itbis: formData.aplica_itbis,
            notas,
          },
          items
        );
      } else {
        await onGuardarFactura(
          {
            id: editandoId ?? undefined,
            cliente_id: formData.cliente_id,
            fecha: formData.fecha,
            ncf: limpiarTexto(formData.ncf, 13).toUpperCase() || null,
            aplica_itbis: formData.aplica_itbis,
            notas,
          },
          items
        );
      }
    });

    if (ok) setIsDocModalOpen(false);
  };

  // ---------------------------------------------------------------
  // Pagos
  // ---------------------------------------------------------------
  const abrirPago = (fac: Factura) => {
    setPagoFacturaId(fac.id);
    setPagoMonto(String(fac.saldo_pendiente));
    setPagoMetodo('efectivo');
    setPagoRef('');
    setErrorPago('');
  };

  const handleConfirmarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagoFactura) return;

    const monto = aNumero(pagoMonto);
    if (monto === null) {
      setErrorPago('Escribe un monto válido.');
      return;
    }
    if (monto <= 0) {
      setErrorPago('El monto debe ser mayor que cero.');
      return;
    }
    // El sobrepago se rechaza en vez de recortarse en silencio, que era lo
    // que hacía desaparecer el excedente sin dejar rastro.
    if (redondearDinero(monto) > pagoFactura.saldo_pendiente) {
      setErrorPago(
        `El monto supera el saldo pendiente (${formatCurrency(pagoFactura.saldo_pendiente)}).`
      );
      return;
    }

    const ok = await ejecutar(() =>
      onRegistrarPago({
        factura_id: pagoFactura.id,
        monto: redondearDinero(monto),
        metodo: pagoMetodo,
        referencia: limpiarTexto(pagoRef, 120) || undefined,
      })
    );

    if (ok) setPagoFacturaId(null);
  };

  // ---------------------------------------------------------------
  // Listados
  // ---------------------------------------------------------------
  const nombreCliente = (id: string) =>
    state.clientes.find((c) => c.id === id)?.nombre ?? 'Cliente sin asignar';

  const q = search.trim().toLowerCase();

  const cotizacionesFiltradas = state.cotizaciones.filter(
    (c) => !q || c.numero.toLowerCase().includes(q) || nombreCliente(c.cliente_id).toLowerCase().includes(q)
  );

  const facturasFiltradas = state.facturas.filter(
    (f) =>
      !q ||
      f.numero.toLowerCase().includes(q) ||
      (f.ncf ?? '').toLowerCase().includes(q) ||
      nombreCliente(f.cliente_id).toLowerCase().includes(q)
  );

  const tituloModal = editandoId
    ? `Editar ${subTab === 'cotizaciones' ? 'cotización' : 'factura'} ${numeroEditando}`
    : `Nueva ${subTab === 'cotizaciones' ? 'cotización' : 'factura'}`;

  return (
    <div className="space-y-4 pb-20">
      {/* Selector de tipo */}
      <div className="flex items-center bg-white border border-slate-200 p-1.5 rounded-2xl gap-1">
        {(['cotizaciones', 'facturas'] as SubTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              subTab === tab
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab === 'cotizaciones' ? (
              <FileText className="w-4 h-4" />
            ) : (
              <DollarSign className="w-4 h-4" />
            )}
            {tab === 'cotizaciones' ? 'Cotizaciones' : 'Facturas'} (
            {tab === 'cotizaciones' ? state.cotizaciones.length : state.facturas.length})
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar en ${subTab}…`}
            className="w-full bg-white shadow-sm border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          onClick={() => abrirCreacion(subTab)}
          className="flex items-center justify-center gap-2 font-semibold text-sm px-4 py-2.5 rounded-xl shadow-md transition-all text-white bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
        >
          <Plus className="w-4 h-4" /> Crear {subTab === 'cotizaciones' ? 'cotización' : 'factura'}
        </button>
      </div>

      {/* Cotizaciones */}
      {subTab === 'cotizaciones' ? (
        <div className="space-y-3">
          {cotizacionesFiltradas.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm font-medium">
                {q ? 'No se encontraron cotizaciones.' : 'No hay cotizaciones registradas.'}
              </p>
              {!q ? (
                <button
                  onClick={() => abrirCreacion('cotizaciones')}
                  className="mt-3 text-sm text-emerald-600 font-semibold hover:underline"
                >
                  + Crear la primera cotización
                </button>
              ) : null}
            </div>
          ) : (
            cotizacionesFiltradas.map((cot) => {
              const cli = state.clientes.find((c) => c.id === cot.cliente_id);
              const whatsappUrl = generateWhatsappQuoteUrl(cot, cli, state.settings);

              return (
                <div
                  key={cot.id}
                  className="bg-white shadow-sm border border-slate-200 rounded-2xl p-4 transition-all hover:border-emerald-400 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800 text-sm">{cot.numero}</span>
                        <span
                          className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            cot.estado === 'aceptada'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : cot.estado === 'enviada'
                              ? 'bg-slate-50 text-slate-600 border-slate-200'
                              : cot.estado === 'rechazada'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : cot.estado === 'vencida'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {cot.estado}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 font-semibold mt-0.5 truncate">
                        {cli?.nombre ?? 'Cliente sin asignar'}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {formatDate(cot.fecha)} · Validez: {cot.validez_dias} días ·{' '}
                        {cot.items?.length ?? 0}{' '}
                        {(cot.items?.length ?? 0) === 1 ? 'línea' : 'líneas'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-emerald-700 block">
                        {formatCurrency(cot.total)}
                      </span>
                      {cot.aplica_itbis ? (
                        <span className="text-[11px] text-slate-500">
                          Incluye ITBIS ({formatCurrency(cot.itbis)})
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onOpenPdfPreview('cotizacion', cot)}
                        className="flex items-center gap-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors text-xs font-semibold"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-600" /> PDF
                      </button>

                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors text-xs font-semibold border border-emerald-200"
                      >
                        <Share2 className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {cot.estado !== 'aceptada' ? (
                        <button
                          onClick={() => void ejecutar(() => onConvertirEnFactura(cot))}
                          disabled={ejecutando}
                          className="flex items-center gap-1 text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                          title="Convertir en factura"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" /> Facturar
                        </button>
                      ) : null}

                      <button
                        onClick={() => abrirEdicion(cot, 'cotizaciones')}
                        className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg hover:bg-slate-100"
                        title="Editar cotización"
                        aria-label={`Editar ${cot.numero}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => void ejecutar(() => onDeleteCotizacion(cot))}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        title="Eliminar cotización"
                        aria-label={`Eliminar ${cot.numero}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {/* Facturas */}
      {subTab === 'facturas' ? (
        <div className="space-y-3">
          {facturasFiltradas.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
              <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm font-medium">
                {q ? 'No se encontraron facturas.' : 'No hay facturas registradas.'}
              </p>
              {!q ? (
                <button
                  onClick={() => abrirCreacion('facturas')}
                  className="mt-3 text-sm text-emerald-600 font-semibold hover:underline"
                >
                  + Crear la primera factura
                </button>
              ) : null}
            </div>
          ) : (
            facturasFiltradas.map((fac) => {
              const cli = state.clientes.find((c) => c.id === fac.cliente_id);
              const whatsappUrl = generateWhatsappInvoiceUrl(fac, cli, state.settings);

              return (
                <div
                  key={fac.id}
                  className="bg-white shadow-sm border border-slate-200 rounded-2xl p-4 transition-all hover:border-emerald-400 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800 text-sm">{fac.numero}</span>
                        {fac.ncf ? (
                          <span
                            className="text-[11px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200"
                            title={describirNCF(fac.ncf) ?? undefined}
                          >
                            NCF: {fac.ncf}
                          </span>
                        ) : null}
                        <span
                          className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            fac.estado === 'pagada'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : fac.estado === 'parcial'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {fac.estado}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 font-semibold mt-0.5 truncate">
                        {cli?.nombre ?? 'Cliente sin asignar'}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {formatDate(fac.fecha)} · {fac.items?.length ?? 0}{' '}
                        {(fac.items?.length ?? 0) === 1 ? 'línea' : 'líneas'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-emerald-700 block">
                        {formatCurrency(fac.total)}
                      </span>
                      {fac.saldo_pendiente > 0 ? (
                        <span className="text-xs text-amber-700 font-bold">
                          Debe: {formatCurrency(fac.saldo_pendiente)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-semibold flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Saldada
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onOpenPdfPreview('factura', fac)}
                        className="flex items-center gap-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors text-xs font-semibold"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-600" /> PDF
                      </button>

                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors text-xs font-semibold border border-emerald-200"
                      >
                        <Share2 className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {fac.saldo_pendiente > 0 ? (
                        <button
                          onClick={() => abrirPago(fac)}
                          className="flex items-center gap-1 text-white bg-emerald-600 hover:bg-emerald-700 font-bold px-3 py-1 rounded-lg text-xs shadow-sm transition-all"
                        >
                          <DollarSign className="w-3.5 h-3.5" /> Registrar pago
                        </button>
                      ) : null}

                      <button
                        onClick={() => abrirEdicion(fac, 'facturas')}
                        className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg hover:bg-slate-100"
                        title="Editar factura"
                        aria-label={`Editar ${fac.numero}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => void ejecutar(() => onDeleteFactura(fac))}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        title="Eliminar factura"
                        aria-label={`Eliminar ${fac.numero}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      <button
        onClick={() => abrirCreacion(subTab)}
        className="fixed bottom-20 right-4 sm:right-8 z-30 w-14 h-14 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30"
        title={`Crear ${subTab === 'cotizaciones' ? 'cotización' : 'factura'}`}
        aria-label={`Crear ${subTab === 'cotizaciones' ? 'cotización' : 'factura'}`}
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Formulario de documento */}
      {isDocModalOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col my-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{tituloModal}</h3>
                {!editandoId ? (
                  <p className="text-xs text-slate-500">
                    El número se asigna automáticamente al guardar.
                  </p>
                ) : null}
              </div>
              <button
                onClick={() => setIsDocModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitDocument}
              className="space-y-4 overflow-y-auto pr-1 flex-1"
              noValidate
            >
              {errorForm ? (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorForm}</span>
                </div>
              ) : null}

              {clientesActivos.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-xl">
                  No tienes clientes registrados. Crea uno antes de emitir documentos.
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="doc-cliente" className="block text-sm font-semibold text-slate-700 mb-1">
                    Cliente *
                  </label>
                  <select
                    id="doc-cliente"
                    value={formData.cliente_id}
                    onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value="">— Seleccionar cliente —</option>
                    {clientesActivos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="doc-fecha" className="block text-sm font-semibold text-slate-700 mb-1">
                      Fecha
                    </label>
                    <input
                      id="doc-fecha"
                      type="date"
                      value={formData.fecha}
                      onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {subTab === 'cotizaciones' ? (
                    <div>
                      <label
                        htmlFor="doc-validez"
                        className="block text-sm font-semibold text-slate-700 mb-1"
                      >
                        Validez (días)
                      </label>
                      <input
                        id="doc-validez"
                        type="number"
                        min={1}
                        max={365}
                        value={formData.validez_dias}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            validez_dias: sanearNumero(e.target.value, {
                              min: 1,
                              max: 365,
                              decimales: 0,
                              porDefecto: 15,
                            }),
                          })
                        }
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="doc-numero" className="block text-sm font-semibold text-slate-700 mb-1">
                        Número
                      </label>
                      <input
                        id="doc-numero"
                        type="text"
                        readOnly
                        value={numeroEditando || 'Automático'}
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-500 font-mono cursor-not-allowed"
                      />
                    </div>
                  )}
                </div>
              </div>

              {subTab === 'facturas' ? (
                <div>
                  <label htmlFor="doc-ncf" className="block text-sm font-semibold text-slate-700 mb-1">
                    NCF (Número de Comprobante Fiscal){' '}
                    <span className="font-normal text-slate-400">— opcional</span>
                  </label>
                  <input
                    id="doc-ncf"
                    type="text"
                    maxLength={11}
                    value={formData.ncf}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ncf: e.target.value.toUpperCase().replace(/[^BE0-9]/g, '').slice(0, 11),
                      })
                    }
                    placeholder="B0100000123"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  {describirNCF(formData.ncf) ? (
                    <p className="text-xs text-emerald-700 font-semibold mt-1">
                      Tipo: {describirNCF(formData.ncf)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Líneas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                    Líneas de servicios o productos
                  </h4>
                  <button
                    type="button"
                    onClick={agregarLinea}
                    className="text-sm font-semibold text-emerald-700 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar línea
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.items.map((item, idx) => (
                    <div
                      key={item.clave}
                      className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={item.servicio_id ?? ''}
                          onChange={(e) => tomarDelCatalogo(item.clave, e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600 focus:outline-none focus:border-emerald-500 max-w-[70%]"
                          aria-label={`Servicio del catálogo para la línea ${idx + 1}`}
                        >
                          <option value="">— Tomar del catálogo —</option>
                          {serviciosActivos.map((s: Servicio) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre} ({formatCurrency(s.precio_base)} / {s.unidad})
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => quitarLinea(item.clave)}
                          disabled={formData.items.length === 1}
                          className="text-slate-400 hover:text-red-600 p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Quitar línea"
                          aria-label={`Quitar línea ${idx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <input
                        type="text"
                        maxLength={300}
                        placeholder="Descripción del servicio o artículo…"
                        value={item.descripcion}
                        onChange={(e) => actualizarLinea(item.clave, { descripcion: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                        aria-label={`Descripción de la línea ${idx + 1}`}
                      />

                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">Cantidad</label>
                          <input
                            type="number"
                            min={0.01}
                            step="any"
                            value={item.cantidad}
                            onChange={(e) =>
                              actualizarLinea(item.clave, {
                                cantidad: sanearNumero(e.target.value, {
                                  min: 0,
                                  max: 100000,
                                  decimales: 2,
                                }),
                              })
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Precio unit.
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={item.precio_unitario}
                            onChange={(e) =>
                              actualizarLinea(item.clave, {
                                precio_unitario: sanearNumero(e.target.value, {
                                  min: 0,
                                  max: 99999999,
                                  decimales: 2,
                                }),
                              })
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-sm text-slate-800 font-bold focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">Importe</label>
                          {/* Antes esta caja era `bg-slate-950`: un recuadro
                              negro en medio del formulario claro. */}
                          <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-sm font-black text-emerald-700">
                            {formatCurrency(item.importe)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.aplica_itbis}
                    onChange={(e) => setFormData({ ...formData, aplica_itbis: e.target.checked })}
                    className="w-4 h-4 rounded accent-emerald-600"
                  />
                  Aplicar ITBIS ({state.settings.itbis_rate}%)
                </label>

                <div className="border-t border-slate-200 pt-2 space-y-1 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-slate-800">
                      {formatCurrency(totales.subtotal)}
                    </span>
                  </div>
                  {formData.aplica_itbis ? (
                    <div className="flex justify-between text-slate-600">
                      <span>ITBIS ({state.settings.itbis_rate}%):</span>
                      <span className="font-semibold text-slate-800">
                        {formatCurrency(totales.itbis)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-base font-black text-emerald-700 pt-1 border-t border-slate-200">
                    <span>TOTAL:</span>
                    <span>{formatCurrency(totales.total)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="doc-notas" className="block text-sm font-semibold text-slate-700 mb-1">
                  Notas o condiciones
                </label>
                <textarea
                  id="doc-notas"
                  rows={2}
                  maxLength={1000}
                  value={formData.notas}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                  placeholder="Términos de garantía o instrucciones de pago…"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsDocModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ejecutando || clientesActivos.length === 0}
                  className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-md shadow-emerald-600/20 transition-colors"
                >
                  {ejecutando
                    ? 'Guardando…'
                    : editandoId
                    ? 'Guardar cambios'
                    : `Guardar ${subTab === 'cotizaciones' ? 'cotización' : 'factura'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Registro de pago */}
      {pagoFactura ? (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Registrar pago de factura</h3>
                <p className="text-sm text-slate-500">{pagoFactura.numero}</p>
              </div>
              <button
                onClick={() => setPagoFacturaId(null)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmarPago} className="space-y-3" noValidate>
              {errorPago ? (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorPago}</span>
                </div>
              ) : null}

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Total factura:</span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(pagoFactura.total)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Ya pagado:</span>
                  <span className="font-semibold text-emerald-700">
                    {formatCurrency(pagoFactura.monto_pagado)}
                  </span>
                </div>
                <div className="flex justify-between text-amber-800 font-bold pt-1 border-t border-slate-200">
                  <span>Saldo pendiente:</span>
                  <span>{formatCurrency(pagoFactura.saldo_pendiente)}</span>
                </div>
              </div>

              <div>
                <label htmlFor="pago-monto" className="block text-sm font-semibold text-slate-700 mb-1">
                  Monto a abonar *
                </label>
                <input
                  id="pago-monto"
                  type="number"
                  min={0.01}
                  max={pagoFactura.saldo_pendiente}
                  step="any"
                  value={pagoMonto}
                  onChange={(e) => {
                    setPagoMonto(e.target.value);
                    setErrorPago('');
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-emerald-700 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setPagoMonto(String(pagoFactura.saldo_pendiente))}
                  className="text-xs font-semibold text-emerald-700 hover:underline mt-1"
                >
                  Abonar el saldo completo
                </button>
              </div>

              <div>
                <label htmlFor="pago-metodo" className="block text-sm font-semibold text-slate-700 mb-1">
                  Método de pago
                </label>
                <select
                  id="pago-metodo"
                  value={pagoMetodo}
                  onChange={(e) => setPagoMetodo(e.target.value as MetodoPago)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia bancaria</option>
                  <option value="tarjeta">Tarjeta de crédito o débito</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label htmlFor="pago-ref" className="block text-sm font-semibold text-slate-700 mb-1">
                  Referencia <span className="font-normal text-slate-400">— opcional</span>
                </label>
                <input
                  id="pago-ref"
                  type="text"
                  maxLength={120}
                  value={pagoRef}
                  onChange={(e) => setPagoRef(e.target.value)}
                  placeholder="Ej: TR-891234 / Depósito Banreservas"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPagoFacturaId(null)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ejecutando}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {ejecutando ? 'Registrando…' : 'Confirmar pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
