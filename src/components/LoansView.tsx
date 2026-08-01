import React, { useEffect, useMemo, useState } from 'react';
import type {
  AppState,
  Cuota,
  FrecuenciaPrestamo,
  MetodoPago,
  ModalidadInteres,
  Prestamo,
} from '../types';
import type { SolicitudApertura } from '../App';
import { formatCurrency, formatDate } from '../utils/sanitizer';
import {
  FRECUENCIAS,
  FRECUENCIAS_VALIDAS,
  MODALIDADES,
  MODALIDADES_VALIDAS,
  calcularPrestamo,
  frecuenciaSegura,
  modalidadSegura,
  tasaAnualEquivalente,
} from '../utils/calculos';
import {
  limpiarTexto,
  primerError,
  redondearDinero,
  sanearNumero,
  validarEntero,
  validarFecha,
  validarMonto,
  validarPorcentaje,
} from '../utils/validacion';
import { CampoMoneda } from './campos/CampoMoneda';
import { useAccionAsync } from '../hooks/useAccionAsync';
import { generateWhatsappLoanCuotaUrl } from '../utils/whatsapp';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Edit2,
  Info,
  Landmark,
  Plus,
  Search,
  Share2,
  TrendingUp,
  X,
} from 'lucide-react';

interface LoansViewProps {
  state: AppState;
  solicitud: SolicitudApertura | null;
  onGuardarPrestamo: (datos: Partial<Prestamo> & { cliente_id: string }) => Promise<void>;
  onRegistrarPagoCuota: (
    cuotaId: string,
    monto: number,
    metodo: MetodoPago,
    referencia?: string
  ) => Promise<void>;
  onDeletePrestamo: (prestamo: Prestamo) => Promise<void>;
}

interface FormularioPrestamo {
  cliente_id: string;
  monto_prestado: number | null;
  tasa_interes: number;
  num_cuotas: number;
  frecuencia: FrecuenciaPrestamo;
  modalidad_interes: ModalidadInteres;
  fecha_inicio: string;
}

const FORM_INICIAL: FormularioPrestamo = {
  cliente_id: '',
  monto_prestado: null,
  tasa_interes: 10,
  num_cuotas: 4,
  frecuencia: 'quincenal',
  modalidad_interes: 'por_periodo',
  fecha_inicio: new Date().toISOString().split('T')[0],
};

export const LoansView: React.FC<LoansViewProps> = ({
  state,
  solicitud,
  onGuardarPrestamo,
  onRegistrarPagoCuota,
  onDeletePrestamo,
}) => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [selectedPrestamoId, setSelectedPrestamoId] = useState<string | null>(null);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [errorForm, setErrorForm] = useState('');

  const [cuotaPagoId, setCuotaPagoId] = useState<string | null>(null);
  const [pagoMonto, setPagoMonto] = useState<number | null>(null);
  const [pagoMetodo, setPagoMetodo] = useState<MetodoPago>('efectivo');
  const [pagoRef, setPagoRef] = useState('');
  const [errorPago, setErrorPago] = useState('');

  const { ejecutando, ejecutar } = useAccionAsync();

  const clientesActivos = useMemo(() => state.clientes.filter((c) => c.activo), [state.clientes]);

  /**
   * El préstamo abierto se deriva del estado en cada render.
   *
   * Antes se guardaba una copia del objeto: al registrar un pago el estado
   * se actualizaba pero el modal seguía mostrando la copia vieja, así que
   * la pantalla no cambiaba hasta cerrarlo y volver a abrirlo.
   */
  const selectedPrestamo = useMemo(
    () => state.prestamos.find((p) => p.id === selectedPrestamoId) ?? null,
    [state.prestamos, selectedPrestamoId]
  );

  const cuotaEnPago = useMemo(() => {
    if (!selectedPrestamo || !cuotaPagoId) return null;
    return selectedPrestamo.cuotas?.find((c) => c.id === cuotaPagoId) ?? null;
  }, [selectedPrestamo, cuotaPagoId]);

  // Previsualización con la misma fórmula que aplica el servidor
  // (ver utils/calculos.ts y la función guardar_prestamo en SQL)
  const calculo = useMemo(
    () =>
      calcularPrestamo(
        formData.monto_prestado ?? 0,
        formData.tasa_interes,
        formData.num_cuotas,
        formData.modalidad_interes
      ),
    [
      formData.monto_prestado,
      formData.tasa_interes,
      formData.num_cuotas,
      formData.modalidad_interes,
    ]
  );

  const frecuenciaActual = FRECUENCIAS[frecuenciaSegura(formData.frecuencia)];

  const abrirCreacion = React.useCallback(() => {
    setEditandoId(null);
    setErrorForm('');
    setFormData({ ...FORM_INICIAL, fecha_inicio: new Date().toISOString().split('T')[0] });
    setIsModalOpen(true);
  }, []);

  useEffect(() => {
    if (solicitud?.destino === 'prestamo') abrirCreacion();
  }, [solicitud, abrirCreacion]);

  const abrirEdicion = (prestamo: Prestamo) => {
    setEditandoId(prestamo.id);
    setErrorForm('');
    setFormData({
      cliente_id: prestamo.cliente_id,
      monto_prestado: Number(prestamo.monto_prestado),
      tasa_interes: Number(prestamo.tasa_interes),
      num_cuotas: Number(prestamo.num_cuotas),
      frecuencia: frecuenciaSegura(prestamo.frecuencia),
      modalidad_interes: modalidadSegura(prestamo.modalidad_interes),
      fecha_inicio: (prestamo.fecha_inicio ?? '').split('T')[0],
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.cliente_id) {
      setErrorForm('Selecciona el cliente deudor.');
      return;
    }

    const fallo = primerError(
      validarMonto(formData.monto_prestado, 'El monto prestado', { min: 1 }),
      validarPorcentaje(formData.tasa_interes, 'La tasa de interés'),
      validarEntero(formData.num_cuotas, 'El número de cuotas', 1, 120),
      validarFecha(formData.fecha_inicio, 'La fecha de inicio')
    );
    if (fallo) {
      setErrorForm(fallo);
      return;
    }

    const ok = await ejecutar(() =>
      onGuardarPrestamo({
        id: editandoId ?? undefined,
        cliente_id: formData.cliente_id,
        monto_prestado: sanearNumero(formData.monto_prestado, {
          min: 0,
          max: 99999999,
          decimales: 2,
        }),
        tasa_interes: formData.tasa_interes,
        num_cuotas: formData.num_cuotas,
        frecuencia: formData.frecuencia,
        modalidad_interes: formData.modalidad_interes,
        fecha_inicio: formData.fecha_inicio,
      })
    );

    if (ok) setIsModalOpen(false);
  };

  // ---------------------------------------------------------------
  // Abono de cuota
  // ---------------------------------------------------------------
  const abrirPagoCuota = (cuota: Cuota) => {
    const restante = redondearDinero(cuota.monto - (cuota.monto_pagado || 0));
    setCuotaPagoId(cuota.id);
    setPagoMonto(restante);
    setPagoMetodo('efectivo');
    setPagoRef('');
    setErrorPago('');
  };

  const handleConfirmarPagoCuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuotaEnPago) return;

    const restante = redondearDinero(cuotaEnPago.monto - (cuotaEnPago.monto_pagado || 0));
    const monto = pagoMonto;

    if (monto === null) {
      setErrorPago('Escribe un monto válido.');
      return;
    }
    if (monto <= 0) {
      setErrorPago('El abono debe ser mayor que cero.');
      return;
    }
    if (redondearDinero(monto) > restante) {
      setErrorPago(`El abono supera lo que resta de la cuota (${formatCurrency(restante)}).`);
      return;
    }

    const ok = await ejecutar(() =>
      onRegistrarPagoCuota(
        cuotaEnPago.id,
        redondearDinero(monto),
        pagoMetodo,
        limpiarTexto(pagoRef, 120) || undefined
      )
    );

    if (ok) setCuotaPagoId(null);
  };

  // ---------------------------------------------------------------
  // Listado
  // ---------------------------------------------------------------
  const nombreCliente = (id: string) =>
    state.clientes.find((c) => c.id === id)?.nombre ?? 'Cliente sin asignar';

  const q = search.trim().toLowerCase();
  const prestamosFiltrados = state.prestamos.filter(
    (p) =>
      !q ||
      nombreCliente(p.cliente_id).toLowerCase().includes(q) ||
      String(p.monto_prestado).includes(q)
  );

  const tienePagos = (p: Prestamo | null) =>
    (p?.cuotas ?? []).some((c) => (c.monto_pagado || 0) > 0);

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-600" /> Préstamos
          </h2>
          <p className="text-sm text-slate-500">
            Control de cuotas, interés fijo y cobranza de préstamos.
          </p>
        </div>

        <button
          onClick={abrirCreacion}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition-all"
        >
          <Plus className="w-4 h-4" /> Nuevo préstamo
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar préstamo por nombre del cliente…"
          className="w-full bg-white shadow-sm border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {prestamosFiltrados.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
          <Landmark className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">
            {q ? 'No se encontraron préstamos.' : 'No hay préstamos registrados.'}
          </p>
          {!q ? (
            <button
              onClick={abrirCreacion}
              className="mt-3 text-sm text-emerald-600 font-semibold hover:underline"
            >
              + Conceder el primer préstamo
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prestamosFiltrados.map((prestamo) => {
            const cuotas = prestamo.cuotas ?? [];
            const totalPagado = cuotas.reduce((acc, c) => acc + (c.monto_pagado || 0), 0);
            const progreso =
              prestamo.total_a_pagar > 0
                ? Math.min(100, redondearDinero((totalPagado / prestamo.total_a_pagar) * 100))
                : 0;
            const atrasadas = cuotas.filter((c) => c.estado === 'atrasada').length;

            return (
              <div
                key={prestamo.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 transition-all hover:border-emerald-400 shadow-sm space-y-3 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => setSelectedPrestamoId(prestamo.id)}
                    className="text-left min-w-0 flex-1"
                  >
                    <h3 className="font-bold text-slate-800 text-sm group-hover:text-emerald-700 transition-colors truncate">
                      {nombreCliente(prestamo.cliente_id)}
                    </h3>
                    <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      Inicio: {formatDate(prestamo.fecha_inicio)} · {prestamo.num_cuotas} cuotas{' '}
                      {FRECUENCIAS[frecuenciaSegura(prestamo.frecuencia)].plural}
                    </p>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                        prestamo.estado === 'saldado'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : atrasadas > 0
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {prestamo.estado === 'saldado'
                        ? 'SALDADO'
                        : atrasadas > 0
                        ? `${atrasadas} ATRASO${atrasadas === 1 ? '' : 'S'}`
                        : 'AL DÍA'}
                    </span>

                    <button
                      onClick={() => abrirEdicion(prestamo)}
                      className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg hover:bg-slate-100"
                      title="Editar préstamo"
                      aria-label="Editar préstamo"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-sm border border-slate-200">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Prestado</span>
                    <span className="font-bold text-slate-800">
                      {formatCurrency(prestamo.monto_prestado)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">
                      Interés ({prestamo.tasa_interes}%
                      {modalidadSegura(prestamo.modalidad_interes) === 'fijo_total'
                        ? ' único'
                        : ` ${FRECUENCIAS[frecuenciaSegura(prestamo.frecuencia)].adjetivo}`}
                      {modalidadSegura(prestamo.modalidad_interes) === 'amortizado'
                        ? ' amort.'
                        : ''}
                      )
                    </span>
                    <span className="font-bold text-slate-700">
                      +{formatCurrency(prestamo.interes_total)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Total a pagar</span>
                    <span className="font-black text-emerald-700">
                      {formatCurrency(prestamo.total_a_pagar)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-500">Progreso del saldo</span>
                    <span className="text-emerald-700">
                      {formatCurrency(totalPagado)} / {formatCurrency(prestamo.total_a_pagar)} (
                      {progreso.toFixed(0)}%)
                    </span>
                  </div>
                  <div
                    className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200"
                    role="progressbar"
                    aria-valuenow={Math.round(progreso)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${progreso}%` }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => setSelectedPrestamoId(prestamo.id)}
                  className="w-full flex items-center justify-between text-sm text-emerald-700 font-semibold pt-1 hover:text-emerald-800"
                >
                  <span>Ver calendario de cuotas y pagos</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={abrirCreacion}
        className="fixed bottom-20 right-4 sm:right-8 z-30 w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-2xl shadow-emerald-600/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        title="Crear préstamo"
        aria-label="Crear préstamo"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Formulario de préstamo */}
      {isModalOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl my-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editandoId ? 'Editar préstamo' : 'Nuevo préstamo'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              {errorForm ? (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorForm}</span>
                </div>
              ) : null}

              {editandoId ? (
                <div className="bg-slate-50 border border-slate-200 text-slate-600 text-xs p-3 rounded-xl flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                  <span>
                    Al guardar se regenera el calendario de cuotas. Sólo se permite si el préstamo
                    aún no tiene abonos registrados.
                  </span>
                </div>
              ) : null}

              {clientesActivos.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-xl">
                  No tienes clientes registrados. Crea uno antes de conceder un préstamo.
                </div>
              ) : null}

              <div>
                <label htmlFor="pres-cliente" className="block text-sm font-semibold text-slate-700 mb-1">
                  Cliente deudor *
                </label>
                <select
                  id="pres-cliente"
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

              <div>
                <label htmlFor="pres-monto" className="block text-sm font-semibold text-slate-700 mb-1">
                  Monto prestado *
                </label>
                <CampoMoneda
                  id="pres-monto"
                  value={formData.monto_prestado}
                  onChange={(monto_prestado) => setFormData({ ...formData, monto_prestado })}
                  className="font-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="pres-cuotas" className="block text-sm font-semibold text-slate-700 mb-1">
                    Número de cuotas *
                  </label>
                  <input
                    id="pres-cuotas"
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    value={formData.num_cuotas}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        num_cuotas: sanearNumero(e.target.value, {
                          min: 1,
                          max: 120,
                          decimales: 0,
                          porDefecto: 1,
                        }),
                      })
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label htmlFor="pres-frec" className="block text-sm font-semibold text-slate-700 mb-1">
                    Frecuencia de pago *
                  </label>
                  <select
                    id="pres-frec"
                    value={formData.frecuencia}
                    onChange={(e) =>
                      setFormData({ ...formData, frecuencia: e.target.value as FrecuenciaPrestamo })
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                  >
                    {FRECUENCIAS_VALIDAS.map((id) => (
                      <option key={id} value={id}>
                        {FRECUENCIAS[id].etiqueta} ({FRECUENCIAS[id].detalle})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="pres-modalidad" className="block text-sm font-semibold text-slate-700 mb-1">
                  Cómo se cobra el interés *
                </label>
                <select
                  id="pres-modalidad"
                  value={formData.modalidad_interes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      modalidad_interes: e.target.value as ModalidadInteres,
                    })
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                >
                  {MODALIDADES_VALIDAS.map((id) => (
                    <option key={id} value={id}>
                      {MODALIDADES[id].descripcion(frecuenciaActual.adjetivo)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pres-tasa" className="block text-sm font-semibold text-slate-700 mb-1">
                  {formData.modalidad_interes === 'fijo_total'
                    ? 'Tasa de interés total (%) *'
                    : `Tasa de interés ${frecuenciaActual.adjetivo} (%) *`}
                </label>
                <input
                  id="pres-tasa"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={formData.tasa_interes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tasa_interes: sanearNumero(e.target.value, {
                        min: 0,
                        max: 100,
                        decimales: 2,
                      }),
                    })
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                  aria-describedby="pres-tasa-ayuda"
                />
                <p id="pres-tasa-ayuda" className="text-xs text-slate-500 mt-1">
                  {formData.modalidad_interes === 'por_periodo'
                    ? `Se cobra ${formData.tasa_interes}% ${frecuenciaActual.adjetivo} sobre el capital completo, en cada una de las ${calculo.numCuotas} cuotas.`
                    : formData.modalidad_interes === 'amortizado'
                    ? `Se cobra ${formData.tasa_interes}% ${frecuenciaActual.adjetivo} sobre el saldo que queda: el interés baja cuota a cuota mientras el capital se liquida.`
                    : 'Se cobra una sola vez sobre el capital, sin importar el plazo.'}
                </p>
              </div>

              <div>
                <label htmlFor="pres-inicio" className="block text-sm font-semibold text-slate-700 mb-1">
                  Fecha de inicio
                </label>
                <input
                  id="pres-inicio"
                  type="date"
                  value={formData.fecha_inicio}
                  onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Resumen en vivo — antes era una caja oscura con texto oscuro */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-800 uppercase tracking-wider mb-1">
                  <TrendingUp className="w-4 h-4 text-emerald-600" /> Resumen del préstamo
                </div>

                <div className="flex justify-between text-sm text-slate-700">
                  <span>Capital prestado:</span>
                  <span className="font-bold text-slate-900">
                    {formatCurrency(formData.monto_prestado ?? 0)}
                  </span>
                </div>

                {formData.modalidad_interes === 'por_periodo' ? (
                  <div className="flex justify-between text-sm text-slate-700">
                    <span>
                      Interés por cuota ({formData.tasa_interes}% {frecuenciaActual.adjetivo}):
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(calculo.interesPorCuota)}
                    </span>
                  </div>
                ) : null}

                {formData.modalidad_interes === 'amortizado' ? (
                  <div className="flex justify-between text-sm text-slate-700">
                    <span>Interés de la 1.ª cuota ({formData.tasa_interes}%):</span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(calculo.interesPorCuota)}
                      <span className="font-normal text-slate-500"> → baja cada cuota</span>
                    </span>
                  </div>
                ) : null}

                <div className="flex justify-between text-sm text-slate-700">
                  <span>
                    Interés total
                    {formData.modalidad_interes === 'por_periodo'
                      ? ` (${calculo.numCuotas} × ${formData.tasa_interes}%)`
                      : formData.modalidad_interes === 'fijo_total'
                      ? ` (${formData.tasa_interes}%)`
                      : ''}
                    :
                  </span>
                  <span className="font-bold text-slate-900">{formatCurrency(calculo.interesTotal)}</span>
                </div>

                <div className="flex justify-between text-sm text-slate-700">
                  <span>Total a pagar:</span>
                  <span className="font-bold text-slate-900">{formatCurrency(calculo.totalAPagar)}</span>
                </div>

                <div className="flex justify-between text-sm font-black text-emerald-800 pt-1.5 border-t border-emerald-200">
                  <span>
                    Cuota {frecuenciaActual.adjetivo} ({calculo.numCuotas}x):
                  </span>
                  <span>{formatCurrency(calculo.cuotaBase)}</span>
                </div>

                <p className="text-[11px] text-emerald-900/70 pt-1 leading-snug">
                  {formData.modalidad_interes === 'fijo_total' ? (
                    'Interés único sobre el capital: no varía con el plazo ni con la frecuencia.'
                  ) : (
                    <>
                      {formData.modalidad_interes === 'amortizado'
                        ? 'La tasa se cobra sobre el saldo pendiente, así que el capital se liquida cuota a cuota. '
                        : 'Interés simple: el capital no se amortiza. '}
                      Equivale a una tasa simple de{' '}
                      <strong>
                        {tasaAnualEquivalente(formData.tasa_interes, formData.frecuencia)}% anual
                      </strong>
                      .
                    </>
                  )}
                </p>

                {/* Tabla de amortización: con la cuota fija cada pago reparte
                    distinto entre interés y capital, y verlo es justo lo que
                    da confianza al deudor. */}
                {formData.modalidad_interes === 'amortizado' && (formData.monto_prestado ?? 0) > 0 ? (
                  <details className="pt-2 border-t border-emerald-200">
                    <summary className="text-[11px] font-bold text-emerald-800 cursor-pointer select-none">
                      Ver tabla de amortización ({calculo.numCuotas} cuotas)
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-[11px] text-right tabular-nums">
                        <thead>
                          <tr className="text-emerald-900/70 border-b border-emerald-200">
                            <th className="text-left font-semibold py-1">#</th>
                            <th className="font-semibold py-1">Cuota</th>
                            <th className="font-semibold py-1">Interés</th>
                            <th className="font-semibold py-1">Capital</th>
                            <th className="font-semibold py-1">Saldo</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-700">
                          {calculo.cuotas.map((c) => (
                            <tr key={c.numero} className="border-b border-emerald-100 last:border-0">
                              <td className="text-left py-1">{c.numero}</td>
                              <td className="py-1 font-semibold">{formatCurrency(c.monto)}</td>
                              <td className="py-1">{formatCurrency(c.interes)}</td>
                              <td className="py-1">{formatCurrency(c.capital)}</td>
                              <td className="py-1">{formatCurrency(c.saldo)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ejecutando || clientesActivos.length === 0}
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white shadow-md shadow-emerald-600/20 transition-colors"
                >
                  {ejecutando
                    ? 'Guardando…'
                    : editandoId
                    ? 'Guardar cambios'
                    : 'Generar préstamo y cuotas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Detalle del préstamo */}
      {selectedPrestamo ? (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col my-4">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Detalle del préstamo
                </span>
                {/* Antes `text-white` sobre fondo blanco: invisible */}
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {nombreCliente(selectedPrestamo.cliente_id)}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPrestamoId(null)}
                className="text-slate-400 hover:text-slate-700 p-1 shrink-0"
                aria-label="Cerrar detalle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-500 text-[11px] block">Monto prestado</span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(selectedPrestamo.monto_prestado)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Total a pagar</span>
                  <span className="font-bold text-emerald-700">
                    {formatCurrency(selectedPrestamo.total_a_pagar)}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-200 text-[11px] text-slate-500">
                  {(() => {
                    const modalidad = modalidadSegura(selectedPrestamo.modalidad_interes);
                    const adjetivo =
                      FRECUENCIAS[frecuenciaSegura(selectedPrestamo.frecuencia)].adjetivo;
                    const enTotal = `${formatCurrency(selectedPrestamo.interes_total)} en total.`;

                    if (modalidad === 'por_periodo') {
                      return `Interés ${selectedPrestamo.tasa_interes}% ${adjetivo} sobre el capital completo, cobrado en cada una de las ${selectedPrestamo.num_cuotas} cuotas · ${enTotal}`;
                    }
                    if (modalidad === 'amortizado') {
                      return `Cuota fija amortizada: ${selectedPrestamo.tasa_interes}% ${adjetivo} sobre el saldo pendiente · ${enTotal}`;
                    }
                    return `Interés único del ${selectedPrestamo.tasa_interes}% sobre el capital · ${enTotal}`;
                  })()}
                </div>
              </div>

              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                Calendario de cuotas ({selectedPrestamo.cuotas?.length ?? 0})
              </h4>

              <div className="space-y-2">
                {selectedPrestamo.cuotas?.map((cuota) => {
                  const restante = redondearDinero(cuota.monto - (cuota.monto_pagado || 0));
                  const cli = state.clientes.find((c) => c.id === selectedPrestamo.cliente_id);
                  const recordatorio = generateWhatsappLoanCuotaUrl(
                    selectedPrestamo,
                    cuota,
                    cli,
                    state.settings
                  );

                  return (
                    <div
                      key={cuota.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                        cuota.estado === 'pagada'
                          ? 'bg-emerald-50 border-emerald-200'
                          : cuota.estado === 'atrasada'
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 text-sm">
                            Cuota #{cuota.numero}
                          </span>
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              cuota.estado === 'pagada'
                                ? 'bg-white text-emerald-700 border-emerald-200'
                                : cuota.estado === 'atrasada'
                                ? 'bg-white text-amber-800 border-amber-300'
                                : cuota.estado === 'parcial'
                                ? 'bg-white text-slate-700 border-slate-300'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {cuota.estado}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          Vence: {formatDate(cuota.fecha_vencimiento)}
                        </p>

                        {/* Desglose de la cuota. Los préstamos creados antes
                            de guardarlo no lo tienen: se omite en vez de
                            mostrar ceros que no significan nada. */}
                        {cuota.interes > 0 || cuota.capital > 0 ? (
                          <p className="text-[11px] text-slate-500">
                            Interés {formatCurrency(cuota.interes)} · capital{' '}
                            {formatCurrency(cuota.capital)} · saldo{' '}
                            {formatCurrency(cuota.saldo_capital)}
                          </p>
                        ) : null}

                        {cuota.monto_pagado > 0 && cuota.estado !== 'pagada' ? (
                          <p className="text-xs text-slate-600 font-semibold">
                            Abonado {formatCurrency(cuota.monto_pagado)} · resta{' '}
                            {formatCurrency(restante)}
                          </p>
                        ) : null}
                      </div>

                      <div className="text-right space-y-1 shrink-0">
                        <span className="font-black text-slate-800 text-sm block">
                          {formatCurrency(cuota.monto)}
                        </span>

                        <div className="flex items-center justify-end gap-1.5">
                          {cuota.estado !== 'pagada' ? (
                            <button
                              onClick={() => abrirPagoCuota(cuota)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] transition-all shadow-sm"
                            >
                              Abonar
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Pagada
                            </span>
                          )}

                          <a
                            href={recordatorio}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-emerald-700 hover:text-emerald-800 bg-emerald-50 rounded-md border border-emerald-200"
                            title="Enviar recordatorio por WhatsApp"
                          >
                            <Share2 className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 text-sm">
              <button
                onClick={() =>
                  void ejecutar(async () => {
                    await onDeletePrestamo(selectedPrestamo);
                    setSelectedPrestamoId(null);
                  })
                }
                disabled={ejecutando}
                className="text-red-600 hover:text-red-700 font-semibold hover:underline disabled:opacity-50"
              >
                Eliminar préstamo
              </button>

              <div className="flex items-center gap-2">
                {!tienePagos(selectedPrestamo) ? (
                  <button
                    onClick={() => {
                      setSelectedPrestamoId(null);
                      abrirEdicion(selectedPrestamo);
                    }}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-200"
                  >
                    Editar
                  </button>
                ) : null}
                <button
                  onClick={() => setSelectedPrestamoId(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Abono a una cuota */}
      {cuotaEnPago ? (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Abonar a la cuota</h3>
                <p className="text-sm text-slate-500">
                  Cuota #{cuotaEnPago.numero} · vence {formatDate(cuotaEnPago.fecha_vencimiento)}
                </p>
              </div>
              <button
                onClick={() => setCuotaPagoId(null)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmarPagoCuota} className="space-y-3" noValidate>
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
                  <span>Monto de la cuota:</span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(cuotaEnPago.monto)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Ya abonado:</span>
                  <span className="font-semibold text-emerald-700">
                    {formatCurrency(cuotaEnPago.monto_pagado)}
                  </span>
                </div>
                <div className="flex justify-between text-amber-800 font-bold pt-1 border-t border-slate-200">
                  <span>Resta:</span>
                  <span>
                    {formatCurrency(
                      redondearDinero(cuotaEnPago.monto - (cuotaEnPago.monto_pagado || 0))
                    )}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="cuota-monto" className="block text-sm font-semibold text-slate-700 mb-1">
                  Monto a abonar *
                </label>
                <CampoMoneda
                  id="cuota-monto"
                  value={pagoMonto}
                  onChange={(monto) => {
                    setPagoMonto(monto);
                    setErrorPago('');
                  }}
                  className="font-black"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Puedes abonar menos que la cuota completa.
                </p>
              </div>

              <div>
                <label htmlFor="cuota-metodo" className="block text-sm font-semibold text-slate-700 mb-1">
                  Método de pago
                </label>
                <select
                  id="cuota-metodo"
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
                <label htmlFor="cuota-ref" className="block text-sm font-semibold text-slate-700 mb-1">
                  Referencia <span className="font-normal text-slate-400">— opcional</span>
                </label>
                <input
                  id="cuota-ref"
                  type="text"
                  maxLength={120}
                  value={pagoRef}
                  onChange={(e) => setPagoRef(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCuotaPagoId(null)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ejecutando}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {ejecutando ? 'Registrando…' : 'Confirmar abono'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
