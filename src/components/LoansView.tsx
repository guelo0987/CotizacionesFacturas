import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type {
  AppState,
  Cuota,
  FrecuenciaPrestamo,
  MetodoPago,
  ModalidadInteres,
  ModoMora,
  Prestamo,
} from '../types';
import type { SolicitudApertura } from '../App';
import { formatCurrency, formatDate, hoyLocal } from '../utils/sanitizer';
import {
  FRECUENCIAS,
  FRECUENCIAS_VALIDAS,
  MODALIDADES,
  MODALIDADES_CON_PLAZO,
  MODOS_MORA,
  MODOS_MORA_VALIDOS,
  calcularMoraCuota,
  calcularPrestamo,
  moraPendiente,
  moraPendientePrestamo,
  modoMoraSeguro,
  simularMora,
  calcularSaldoParaSaldar,
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
import type { DocumentoPrestamo } from './PrestamoPdfModal';
import { creditoSugerido, repartirCobro, saldoCliente } from '../utils/creditos';

// Diferido, como la vista previa de facturas: arrastra html2pdf con jsPDF y
// html2canvas, y no tiene por qué descargarse hasta que se imprime algo.
const PrestamoPdfModal = lazy(() =>
  import('./PrestamoPdfModal').then((module) => ({ default: module.PrestamoPdfModal }))
);
import { CampoNumero } from './campos/CampoNumero';
import { useAccionAsync } from '../hooks/useAccionAsync';
import { generateWhatsappLoanCuotaUrl } from '../utils/whatsapp';
import {
  capitalPendiente,
  esRedito,
  etiquetaCuota,
  reditoActual,
  repartoRedito,
} from '../utils/documentosPrestamo';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Edit2,
  Info,
  Landmark,
  AlertTriangle,
  BadgeCheck,
  Plus,
  Printer,
  Receipt,
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
    referencia?: string,
    montoMora?: number,
    credito?: number,
    /** Préstamo a rédito: lo que en el mismo cobro va a capital. */
    capital?: number
  ) => Promise<void>;
  /** Préstamo con cuotas: cobra sólo el rédito y corre las cuotas un periodo. */
  onPagarSoloRedito: (cuotaId: string, metodo: MetodoPago, referencia?: string, capital?: number) => Promise<void>;
  onDeletePrestamo: (prestamo: Prestamo) => Promise<void>;
  onConfigurarMora: (
    prestamoId: string,
    activa: boolean,
    diaria: number,
    modo: ModoMora,
    retroactiva?: boolean
  ) => Promise<void>;
  onSaldarPrestamo: (
    prestamoId: string,
    montoEsperado: number,
    metodo: MetodoPago,
    referencia?: string,
    recibido?: number,
    credito?: number
  ) => Promise<Prestamo>;
}

interface FormularioPrestamo {
  cliente_id: string;
  monto_prestado: number | null;
  tasa_interes: number | null;
  num_cuotas: number | null;
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
  fecha_inicio: hoyLocal(),
};

export const LoansView: React.FC<LoansViewProps> = ({
  state,
  solicitud,
  onGuardarPrestamo,
  onRegistrarPagoCuota,
  onPagarSoloRedito,
  onDeletePrestamo,
  onConfigurarMora,
  onSaldarPrestamo,
}) => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [selectedPrestamoId, setSelectedPrestamoId] = useState<string | null>(null);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [errorForm, setErrorForm] = useState('');

  const [documentoPdf, setDocumentoPdf] = useState<DocumentoPrestamo | null>(null);

  // Saldar el préstamo de una vez
  const [saldandoId, setSaldandoId] = useState<string | null>(null);
  const [saldoMetodo, setSaldoMetodo] = useState<MetodoPago>('efectivo');
  const [saldoRef, setSaldoRef] = useState('');
  // Saldo a favor usado y efectivo recibido al saldar
  const [saldoCredito, setSaldoCredito] = useState<number | null>(null);
  const [saldoRecibido, setSaldoRecibido] = useState<number | null>(null);
  const [errorSaldo, setErrorSaldo] = useState('');

  // Configuración de la mora del préstamo abierto
  const [editandoMora, setEditandoMora] = useState(false);
  const [moraDiaria, setMoraDiaria] = useState<number | null>(null);
  const [moraModo, setMoraModo] = useState<ModoMora>('por_cuota');
  const [moraRetroactiva, setMoraRetroactiva] = useState(false);
  const [errorMora, setErrorMora] = useState('');

  const [cuotaPagoId, setCuotaPagoId] = useState<string | null>(null);
  const [pagoMonto, setPagoMonto] = useState<number | null>(null);
  const [pagoMora, setPagoMora] = useState<number | null>(null);
  const [pagoMetodo, setPagoMetodo] = useState<MetodoPago>('efectivo');
  const [pagoRef, setPagoRef] = useState('');
  const [errorPago, setErrorPago] = useState('');
  // Saldo a favor que el cobrador decide usar en el abono
  const [pagoCredito, setPagoCredito] = useState<number | null>(null);
  // Cobro de «solo el rédito» (préstamos con cuotas) y abono a capital (a rédito)
  const [modoCobro, setModoCobro] = useState<'normal' | 'solo_redito'>('normal');
  const [pagoCapital, setPagoCapital] = useState<number | null>(null);

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
        formData.tasa_interes ?? 0,
        formData.num_cuotas ?? 1,
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
  const indefinido = formData.modalidad_interes === 'redito';
  // El mismo día de Santo Domingo con el que el servidor acumula la mora
  // (`hoy_negocio()`): los días que se muestran tienen que cuadrar.
  const hoyISO = hoyLocal();

  const abrirCreacion = React.useCallback(() => {
    setEditandoId(null);
    setErrorForm('');
    setFormData({ ...FORM_INICIAL, fecha_inicio: hoyLocal() });
    setIsModalOpen(true);
  }, []);

  useEffect(() => {
    if (solicitud?.destino === 'prestamo') abrirCreacion();
    // Desde la campanita: abrir la ficha del préstamo
    if (solicitud?.destino === 'ver-prestamo' && solicitud.prestamoId) {
      setSelectedPrestamoId(solicitud.prestamoId);
    }
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
      // A rédito no hay número de cuotas: se cobra hasta que pague el capital
      formData.modalidad_interes === 'redito'
        ? { valido: true }
        : validarEntero(formData.num_cuotas, 'El número de cuotas', 1, 120),
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
        tasa_interes: formData.tasa_interes ?? 0,
        num_cuotas: formData.modalidad_interes === 'redito' ? 1 : formData.num_cuotas ?? 1,
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
    setPagoMora(moraPendiente(cuota) || null);
    setPagoMetodo('efectivo');
    setPagoRef('');
    setErrorPago('');
    setPagoCredito(null);
    setModoCobro('normal');
    setPagoCapital(null);
  };

  /** Saldo a favor del cliente de un préstamo. */
  const saldoAFavorDe = (clienteId: string) => saldoCliente(state.movimientosCredito, clienteId);

  /**
   * Reparto del abono que está escribiendo el cobrador: «A la mora» y «A la
   * cuota» son lo que se paga; lo que pase de la cuota queda a favor del
   * cliente, y el saldo usado se descuenta del efectivo que entrega.
   */
  const prestamoEnPago = cuotaEnPago
    ? state.prestamos.find((p) => p.id === cuotaEnPago.prestamo_id) ?? null
    : null;
  // «Rédito + capital» en un préstamo con cuotas: la cuota con el rédito
  // separado del capital y sin el capital ya pagado
  const admiteSoloRedito = Boolean(
    cuotaEnPago &&
      prestamoEnPago &&
      !esRedito(prestamoEnPago) &&
      !cuotaEnPago.es_capital &&
      cuotaEnPago.interes > 0 &&
      cuotaEnPago.capital > 0 &&
      (cuotaEnPago.monto_pagado || 0) < cuotaEnPago.monto
  );
  const reparto = cuotaEnPago && admiteSoloRedito ? repartoRedito(cuotaEnPago, pagoCapital ?? 0) : null;
  // A rédito, al cobrar un rédito se puede abonar a capital en el mismo cobro
  const admiteCapital = Boolean(prestamoEnPago && esRedito(prestamoEnPago) && cuotaEnPago && !cuotaEnPago.es_capital);

  const repartoAbono = (() => {
    if (!cuotaEnPago) return null;
    const prestamo = state.prestamos.find((p) => p.id === cuotaEnPago.prestamo_id);
    const restante = redondearDinero(cuotaEnPago.monto - (cuotaEnPago.monto_pagado || 0));
    const aMora = redondearDinero(pagoMora ?? 0);
    const aCuota = redondearDinero(pagoMonto ?? 0);
    const credito = redondearDinero(pagoCredito ?? 0);
    const saldoDisponible = prestamo ? saldoAFavorDe(prestamo.cliente_id) : 0;
    return {
      restante,
      aMora,
      aCuota,
      saldoDisponible,
      ...repartirCobro({
        efectivo: redondearDinero(aMora + aCuota - credito),
        credito,
        deuda: redondearDinero(aMora + restante),
        saldoDisponible,
      }),
    };
  })();

  const handleConfirmarPagoCuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuotaEnPago || !repartoAbono) return;

    if (modoCobro === 'solo_redito') {
      if (reparto?.error) {
        setErrorPago(reparto.error);
        return;
      }
      const ok = await ejecutar(() =>
        onPagarSoloRedito(
          cuotaEnPago.id,
          pagoMetodo,
          limpiarTexto(pagoRef, 120) || undefined,
          redondearDinero(pagoCapital ?? 0)
        )
      );
      if (ok) setCuotaPagoId(null);
      return;
    }

    // A rédito: en el mismo cobro puede ir una parte a capital
    const capital = admiteCapital ? redondearDinero(pagoCapital ?? 0) : 0;
    if (capital > 0) {
      const debe = prestamoEnPago ? capitalPendiente(prestamoEnPago) : 0;
      if (capital > debe) {
        setErrorPago(`El abono a capital supera lo que debe de capital (${formatCurrency(debe)}).`);
        return;
      }
      if (repartoAbono.aCuota > repartoAbono.restante) {
        setErrorPago('Lo que pase del rédito ponlo en «Abono a capital».');
        return;
      }
      // Sólo capital: no hace falta cobrar nada del rédito
      if (repartoAbono.aMora + repartoAbono.aCuota <= 0) {
        const ok = await ejecutar(() =>
          onRegistrarPagoCuota(cuotaEnPago.id, 0, pagoMetodo, limpiarTexto(pagoRef, 120) || undefined, 0, 0, capital)
        );
        if (ok) setCuotaPagoId(null);
        return;
      }
    }

    const moraPend = moraPendiente(cuotaEnPago);
    if (repartoAbono.aMora > moraPend) {
      setErrorPago(`La parte de mora supera la mora pendiente (${formatCurrency(moraPend)}).`);
      return;
    }
    if (repartoAbono.error) {
      setErrorPago(repartoAbono.error);
      return;
    }

    const ok = await ejecutar(() =>
      onRegistrarPagoCuota(
        cuotaEnPago.id,
        repartoAbono.efectivo,
        pagoMetodo,
        limpiarTexto(pagoRef, 120) || undefined,
        repartoAbono.aMora,
        repartoAbono.credito,
        capital
      )
    );

    if (ok) setCuotaPagoId(null);
  };

  // ---------------------------------------------------------------
  // Saldar el préstamo
  // ---------------------------------------------------------------
  const prestamoSaldando = useMemo(
    () => state.prestamos.find((p) => p.id === saldandoId) ?? null,
    [state.prestamos, saldandoId]
  );

  const abrirSaldo = (prestamo: Prestamo) => {
    setSaldandoId(prestamo.id);
    setSaldoMetodo('efectivo');
    setSaldoRef('');
    setSaldoCredito(null);
    setSaldoRecibido(calcularSaldoParaSaldar(prestamo).total);
    setErrorSaldo('');
  };

  /** Reparto del saldo: efectivo y saldo a favor contra el total para saldar. */
  const repartoSaldo = (() => {
    if (!prestamoSaldando) return null;
    const { total } = calcularSaldoParaSaldar(prestamoSaldando);
    const credito = redondearDinero(saldoCredito ?? 0);
    const saldoDisponible = saldoAFavorDe(prestamoSaldando.cliente_id);
    const reparto = repartirCobro({
      efectivo: redondearDinero(saldoRecibido ?? 0),
      credito,
      deuda: total,
      saldoDisponible,
    });
    const falta = redondearDinero(total - reparto.entregado);
    return {
      total,
      saldoDisponible,
      ...reparto,
      // Saldar es pagarlo todo: un abono parcial se hace por cuota
      error: reparto.error ?? (falta > 0 ? `Para saldar faltan ${formatCurrency(falta)}.` : null),
    };
  })();

  /** Cambia el saldo usado y ajusta el efectivo a lo que falte. */
  const cambiarCreditoSaldo = (credito: number | null) => {
    setSaldoCredito(credito);
    setErrorSaldo('');
    if (repartoSaldo) {
      setSaldoRecibido(redondearDinero(Math.max(0, repartoSaldo.total - (credito ?? 0))));
    }
  };

  /** Pagos que generó el saldo de un préstamo, para su recibo. */
  const pagosDelSaldo = (prestamo: Prestamo) =>
    (prestamo.pagos ?? []).filter((pago) => pago.saldo_de_prestamo);

  const confirmarSaldo = async () => {
    if (!prestamoSaldando || !repartoSaldo) return;
    if (repartoSaldo.error) {
      setErrorSaldo(repartoSaldo.error);
      return;
    }

    let saldado: Prestamo | null = null;
    const ok = await ejecutar(async () => {
      saldado = await onSaldarPrestamo(
        prestamoSaldando.id,
        repartoSaldo.total,
        saldoMetodo,
        limpiarTexto(saldoRef, 120) || undefined,
        repartoSaldo.efectivo,
        repartoSaldo.credito
      );
    });

    if (ok && saldado) {
      setSaldandoId(null);
      // El cobrador acaba de recibir el dinero: lo siguiente es darle el
      // recibo al cliente, así que se abre sin tener que buscarlo.
      setDocumentoPdf({
        tipo: 'saldo',
        prestamo: saldado,
        pagos: pagosDelSaldo(saldado),
      });
    }
  };

  // ---------------------------------------------------------------
  // Mora
  // ---------------------------------------------------------------
  const abrirEdicionMora = (prestamo: Prestamo) => {
    setMoraDiaria(prestamo.mora_activa ? Number(prestamo.mora_diaria) || null : null);
    setMoraModo(modoMoraSeguro(prestamo.mora_modo));
    setMoraRetroactiva(Boolean(prestamo.mora_retroactiva));
    setErrorMora('');
    setEditandoMora(true);
  };

  const guardarMora = async (prestamo: Prestamo, activa: boolean) => {
    if (activa) {
      const fallo = validarMonto(moraDiaria, 'La mora diaria', { min: 1 });
      if (!fallo.valido) {
        setErrorMora(fallo.mensaje ?? 'Dato inválido.');
        return;
      }
    }

    const ok = await ejecutar(() =>
      onConfigurarMora(
        prestamo.id,
        activa,
        redondearDinero(moraDiaria ?? 0),
        moraModo,
        moraRetroactiva
      )
    );
    if (ok) {
      setEditandoMora(false);
      setErrorMora('');
    }
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
            const redito = esRedito(prestamo);
            // A rédito el progreso es el del capital: el total crece cada periodo
            const meta = redito ? Number(prestamo.monto_prestado) : prestamo.total_a_pagar;
            const totalPagado = redito
              ? redondearDinero(Number(prestamo.monto_prestado) - capitalPendiente(prestamo))
              : cuotas.reduce((acc, c) => acc + (c.monto_pagado || 0), 0);
            const progreso = meta > 0 ? Math.min(100, redondearDinero((totalPagado / meta) * 100)) : 0;
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
                      Inicio: {formatDate(prestamo.fecha_inicio)} ·{' '}
                      {redito
                        ? `Plazo indefinido (${FRECUENCIAS[frecuenciaSegura(prestamo.frecuencia)].adjetivo})`
                        : `${prestamo.num_cuotas} cuotas ${FRECUENCIAS[frecuenciaSegura(prestamo.frecuencia)].plural}`}
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
                      {redito ? 'Rédito' : 'Interés'} ({prestamo.tasa_interes}%
                      {modalidadSegura(prestamo.modalidad_interes) === 'fijo_total'
                        ? ' único'
                        : ` ${FRECUENCIAS[frecuenciaSegura(prestamo.frecuencia)].adjetivo}`}
                      {modalidadSegura(prestamo.modalidad_interes) === 'amortizado'
                        ? ' amort.'
                        : ''}
                      )
                    </span>
                    <span className="font-bold text-slate-700">
                      {redito
                        ? `${formatCurrency(reditoActual(prestamo))}/periodo`
                        : `+${formatCurrency(prestamo.interes_total)}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">
                      {redito ? 'Debe de capital' : 'Total a pagar'}
                    </span>
                    <span className="font-black text-emerald-700">
                      {formatCurrency(redito ? capitalPendiente(prestamo) : prestamo.total_a_pagar)}
                    </span>
                  </div>
                </div>

                {moraPendientePrestamo(prestamo) > 0 ? (
                  <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 text-xs">
                    <span className="font-semibold text-amber-900 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Mora acumulada
                    </span>
                    <span className="font-black text-amber-900">
                      {formatCurrency(moraPendientePrestamo(prestamo))}
                    </span>
                  </div>
                ) : null}

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-500">{redito ? 'Capital pagado' : 'Progreso del saldo'}</span>
                    <span className="text-emerald-700">
                      {formatCurrency(totalPagado)} / {formatCurrency(meta)} (
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
                  {indefinido ? (
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-500">
                      Sin plazo
                    </div>
                  ) : (
                    <CampoNumero
                      id="pres-cuotas"
                      value={formData.num_cuotas}
                      onChange={(num_cuotas) => setFormData({ ...formData, num_cuotas })}
                      max={120}
                    />
                  )}
                  <label className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={indefinido}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          modalidad_interes: e.target.checked ? 'redito' : 'por_periodo',
                        })
                      }
                      className="w-4 h-4 accent-emerald-600"
                    />
                    Indefinido (a rédito)
                  </label>
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

              {indefinido ? (
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-900 leading-snug">
                  <strong>A rédito:</strong> cada periodo se cobra el rédito sobre el capital que se deba. Lo
                  que el cliente pague de más baja el capital y el rédito siguiente sale menor. Termina
                  cuando paga todo el capital.
                </div>
              ) : (
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
                  {MODALIDADES_CON_PLAZO.map((id) => (
                    <option key={id} value={id}>
                      {MODALIDADES[id].descripcion(frecuenciaActual.adjetivo)}
                    </option>
                  ))}
                </select>
              </div>
              )}

              <div>
                <label htmlFor="pres-tasa" className="block text-sm font-semibold text-slate-700 mb-1">
                  {formData.modalidad_interes === 'fijo_total'
                    ? 'Tasa de interés total (%) *'
                    : indefinido
                    ? `Rédito ${frecuenciaActual.adjetivo} (%) *`
                    : `Tasa de interés ${frecuenciaActual.adjetivo} (%) *`}
                </label>
                <CampoNumero
                  id="pres-tasa"
                  value={formData.tasa_interes}
                  onChange={(tasa_interes) => setFormData({ ...formData, tasa_interes })}
                  max={100}
                  decimales={2}
                  sufijo="%"
                  aria-describedby="pres-tasa-ayuda"
                />
                <p id="pres-tasa-ayuda" className="text-xs text-slate-500 mt-1">
                  {formData.modalidad_interes === 'por_periodo'
                    ? `Se cobra ${formData.tasa_interes ?? 0}% ${frecuenciaActual.adjetivo} sobre el capital completo, en cada una de las ${calculo.numCuotas} cuotas.`
                    : formData.modalidad_interes === 'amortizado'
                    ? `Se cobra ${formData.tasa_interes ?? 0}% ${frecuenciaActual.adjetivo} sobre el saldo que queda: el interés baja cuota a cuota mientras el capital se liquida.`
                    : indefinido
                    ? `Cada periodo se cobra ${formData.tasa_interes ?? 0}% sobre el capital que se deba.`
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
                      Interés por cuota ({formData.tasa_interes ?? 0}% {frecuenciaActual.adjetivo}):
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(calculo.interesPorCuota)}
                    </span>
                  </div>
                ) : null}

                {indefinido ? (
                  <>
                    <div className="flex justify-between text-sm text-slate-700">
                      <span>
                        Rédito {frecuenciaActual.adjetivo} ({formData.tasa_interes ?? 0}%):
                      </span>
                      <span className="font-bold text-slate-900">{formatCurrency(calculo.interesPorCuota)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-emerald-800 pt-1.5 border-t border-emerald-200">
                      <span>Plazo:</span>
                      <span>Indefinido</span>
                    </div>
                    <p className="text-[11px] text-emerald-900/70 pt-1 leading-snug">
                      El rédito baja cuando el cliente abona a capital. Equivale a una tasa simple de{' '}
                      <strong>{tasaAnualEquivalente(formData.tasa_interes ?? 0, formData.frecuencia)}% anual</strong>.
                    </p>
                  </>
                ) : null}

                {indefinido ? null : (
                <>
                {formData.modalidad_interes === 'amortizado' ? (
                  <div className="flex justify-between text-sm text-slate-700">
                    <span>Interés de la 1.ª cuota ({formData.tasa_interes ?? 0}%):</span>
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
                      ? ` (${calculo.numCuotas} × ${formData.tasa_interes ?? 0}%)`
                      : formData.modalidad_interes === 'fijo_total'
                      ? ` (${formData.tasa_interes ?? 0}%)`
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
                        {tasaAnualEquivalente(formData.tasa_interes ?? 0, formData.frecuencia)}%
                        anual
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
                </>
                )}
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
                    : indefinido
                    ? 'Crear préstamo a rédito'
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
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() =>
                    setDocumentoPdf({ tipo: 'prestamo', prestamo: selectedPrestamo })
                  }
                  className="flex items-center gap-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors text-xs font-semibold"
                  title="Comprobante del préstamo con su calendario de cuotas"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-600" /> Comprobante
                </button>
                <button
                  onClick={() => setSelectedPrestamoId(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                  aria-label="Cerrar detalle"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                  <span className="text-slate-500 text-[11px] block">
                    {esRedito(selectedPrestamo) ? 'Debe de capital' : 'Total a pagar'}
                  </span>
                  <span className="font-bold text-emerald-700">
                    {formatCurrency(
                      esRedito(selectedPrestamo)
                        ? capitalPendiente(selectedPrestamo)
                        : selectedPrestamo.total_a_pagar
                    )}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-200 text-[11px] text-slate-500">
                  {(() => {
                    const modalidad = modalidadSegura(selectedPrestamo.modalidad_interes);
                    const adjetivo =
                      FRECUENCIAS[frecuenciaSegura(selectedPrestamo.frecuencia)].adjetivo;
                    const enTotal = `${formatCurrency(selectedPrestamo.interes_total)} en total.`;

                    if (modalidad === 'redito') {
                      return `A rédito, sin plazo: ${selectedPrestamo.tasa_interes}% ${adjetivo} sobre el capital que se deba. Rédito actual ${formatCurrency(reditoActual(selectedPrestamo))} por periodo; baja cuando abona a capital.`;
                    }
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

              {/* Mora por atraso. Va aquí y no en el formulario del
                  préstamo porque se habilita cuando el cliente ya se
                  atrasó, y para entonces el préstamo suele tener pagos,
                  que es justo lo que impide editarlo. */}
              {(() => {
                const moraPend = moraPendientePrestamo(selectedPrestamo);
                const activa = selectedPrestamo.mora_activa;

                return (
                  <div
                    className={`p-3 rounded-xl border space-y-2 ${
                      moraPend > 0
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                        <AlertTriangle
                          className={`w-3.5 h-3.5 ${activa ? 'text-amber-600' : 'text-slate-400'}`}
                        />
                        Mora por atraso
                      </span>
                      {!editandoMora ? (
                        <button
                          onClick={() => abrirEdicionMora(selectedPrestamo)}
                          className="text-[11px] font-semibold text-emerald-700 hover:underline"
                        >
                          {activa ? 'Cambiar' : 'Habilitar'}
                        </button>
                      ) : null}
                    </div>

                    {editandoMora ? (
                      <div className="space-y-2">
                        {errorMora ? (
                          <div role="alert" className="text-xs text-red-700 font-semibold">
                            {errorMora}
                          </div>
                        ) : null}

                        <div>
                          <label
                            htmlFor="mora-diaria"
                            className="block text-[11px] font-semibold text-slate-700 mb-1"
                          >
                            Cuánto se cobra por cada día de atraso
                          </label>
                          <CampoMoneda
                            id="mora-diaria"
                            value={moraDiaria}
                            onChange={(v) => {
                              setMoraDiaria(v);
                              setErrorMora('');
                            }}
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="mora-modo"
                            className="block text-[11px] font-semibold text-slate-700 mb-1"
                          >
                            Si hay varias cuotas atrasadas
                          </label>
                          <select
                            id="mora-modo"
                            value={moraModo}
                            onChange={(e) => setMoraModo(e.target.value as ModoMora)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                          >
                            {MODOS_MORA_VALIDOS.map((id) => (
                              <option key={id} value={id}>
                                {MODOS_MORA[id].etiqueta}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {MODOS_MORA[moraModo].detalle}.
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="mora-desde-cuando"
                            className="block text-[11px] font-semibold text-slate-700 mb-1"
                          >
                            Desde cuándo se cobra
                          </label>
                          <select
                            id="mora-desde-cuando"
                            value={moraRetroactiva ? 'retroactiva' : 'desde_hoy'}
                            onChange={(e) => setMoraRetroactiva(e.target.value === 'retroactiva')}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                          >
                            <option value="desde_hoy">Desde hoy — no cobra lo ya atrasado</option>
                            <option value="retroactiva">
                              Aplicarla a lo ya atrasado — cobra desde el vencimiento
                            </option>
                          </select>
                        </div>

                        {/* La cifra por adelantado convierte la decisión en
                            una elección, no en una sorpresa. */}
                        {(() => {
                          const previo = simularMora(
                            selectedPrestamo,
                            moraDiaria ?? 0,
                            moraModo,
                            moraRetroactiva,
                            hoyISO
                          );
                          if (!moraDiaria) return null;

                          return previo.total > 0 ? (
                            <div className="bg-amber-100 border border-amber-300 rounded-xl p-2.5 text-xs">
                              <div className="flex justify-between font-bold text-amber-900">
                                <span>Se le cobrarían de entrada:</span>
                                <span>{formatCurrency(previo.total)}</span>
                              </div>
                              <p className="text-[11px] text-amber-900/80 mt-0.5 leading-snug">
                                Por {previo.cuotas} cuota{previo.cuotas === 1 ? '' : 's'} ya
                                vencida{previo.cuotas === 1 ? '' : 's'}.
                              </p>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500 leading-snug">
                              Empieza en cero: la mora corre a partir de hoy.
                            </p>
                          );
                        })()}

                        <p className="text-[11px] text-slate-500 leading-snug">
                          Al quitarla se perdona lo que quede pendiente; lo ya cobrado no se toca.
                        </p>

                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              setEditandoMora(false);
                              setErrorMora('');
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-600 border border-slate-200"
                          >
                            Cancelar
                          </button>
                          {activa ? (
                            <button
                              onClick={() => void guardarMora(selectedPrestamo, false)}
                              disabled={ejecutando}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                            >
                              Quitar mora
                            </button>
                          ) : null}
                          <button
                            onClick={() => void guardarMora(selectedPrestamo, true)}
                            disabled={ejecutando}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white"
                          >
                            {ejecutando ? 'Guardando…' : activa ? 'Guardar' : 'Habilitar mora'}
                          </button>
                        </div>
                      </div>
                    ) : activa ? (
                      <div className="text-xs text-slate-700 space-y-1">
                        <div>
                          <strong>{formatCurrency(selectedPrestamo.mora_diaria)}</strong> por día ·{' '}
                          {MODOS_MORA[modoMoraSeguro(selectedPrestamo.mora_modo)].detalle}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {selectedPrestamo.mora_retroactiva
                            ? 'Aplicada desde el vencimiento de cada cuota'
                            : `Corriendo desde el ${formatDate(selectedPrestamo.mora_desde ?? '')}`}
                        </div>
                        <div className="flex justify-between font-bold text-amber-900 pt-1 border-t border-amber-200">
                          <span>Mora pendiente:</span>
                          <span>{formatCurrency(moraPend)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Sin mora. Habilítala si este cliente se atrasa y quieres cobrarle por cada
                        día que pase.
                      </p>
                    )}
                  </div>
                );
              })()}

              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                {esRedito(selectedPrestamo)
                  ? 'Réditos y capital'
                  : `Calendario de cuotas (${selectedPrestamo.cuotas?.length ?? 0})`}
              </h4>

              <div className="space-y-2">
                {selectedPrestamo.cuotas?.map((cuota) => {
                  const restante = redondearDinero(cuota.monto - (cuota.monto_pagado || 0));
                  const cli = state.clientes.find((c) => c.id === selectedPrestamo.cliente_id);

                  // El recibo se emite sobre el último abono de la cuota:
                  // es el que el cliente acaba de hacer y viene a llevarse.
                  const ultimoAbono =
                    (selectedPrestamo.pagos ?? [])
                      .filter((pago) => pago.cuota_id === cuota.id)
                      .sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))[0] ?? null;

                  const moraCuota = moraPendiente(cuota);
                  const { dias: diasMora } = calcularMoraCuota(selectedPrestamo, cuota, hoyISO);
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
                            {etiquetaCuota(cuota, selectedPrestamo)}
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
                          {cuota.es_capital
                            ? 'Sin fecha: abona cuando pueda'
                            : `Vence: ${formatDate(cuota.fecha_vencimiento)}`}
                        </p>

                        {/* Desglose de la cuota. Los préstamos creados antes
                            de guardarlo no lo tienen: se omite en vez de
                            mostrar ceros que no significan nada. */}
                        {esRedito(selectedPrestamo) && !cuota.es_capital ? (
                          <p className="text-[11px] text-slate-500">
                            {selectedPrestamo.tasa_interes}% sobre {formatCurrency(cuota.saldo_capital)} de capital
                          </p>
                        ) : !cuota.es_capital && cuota.capital <= 0 && cuota.interes > 0 ? (
                          <p className="text-[11px] text-slate-500">Solo rédito: las cuotas se corrieron un periodo</p>
                        ) : !cuota.es_capital && (cuota.interes > 0 || cuota.capital > 0) ? (
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

                        {moraCuota > 0 ? (
                          <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Mora {formatCurrency(moraCuota)}
                            {diasMora > 0 ? ` · ${diasMora} día${diasMora === 1 ? '' : 's'}` : ''}
                          </p>
                        ) : null}
                      </div>

                      <div className="text-right space-y-1 shrink-0">
                        <span className="font-black text-slate-800 text-sm block">
                          {formatCurrency(cuota.monto)}
                        </span>
                        {moraCuota > 0 ? (
                          <span className="text-[11px] font-bold text-amber-800 block">
                            + mora = {formatCurrency(redondearDinero(restante + moraCuota))}
                          </span>
                        ) : null}

                        <div className="flex items-center justify-end gap-1.5">
                          {cuota.estado !== 'pagada' ? (
                            <button
                              onClick={() => abrirPagoCuota(cuota)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] transition-all shadow-sm"
                            >
                              {cuota.es_capital ? 'Abonar a capital' : 'Abonar'}
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Pagada
                            </span>
                          )}

                          {/* Si la cuota se liquidó al saldar el préstamo, su
                              comprobante es el recibo del saldo completo: el
                              cliente entregó un solo pago, no uno por cuota. */}
                          {ultimoAbono?.saldo_de_prestamo ? (
                            <button
                              onClick={() =>
                                setDocumentoPdf({
                                  tipo: 'saldo',
                                  prestamo: selectedPrestamo,
                                  pagos: pagosDelSaldo(selectedPrestamo),
                                })
                              }
                              className="p-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md border border-slate-200"
                              title="Recibo del saldo del préstamo"
                              aria-label={`Recibo de saldo de la cuota ${cuota.numero}`}
                            >
                              <Receipt className="w-3 h-3" />
                            </button>
                          ) : ultimoAbono ? (
                            <button
                              onClick={() =>
                                setDocumentoPdf({
                                  tipo: 'abono',
                                  prestamo: selectedPrestamo,
                                  cuota,
                                  pago: ultimoAbono,
                                })
                              }
                              className="p-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md border border-slate-200"
                              title={`Recibo del abono de ${formatCurrency(ultimoAbono.monto)}`}
                              aria-label={`Recibo del abono de la cuota ${cuota.numero}`}
                            >
                              <Receipt className="w-3 h-3" />
                            </button>
                          ) : null}

                          {cuota.es_capital ? null : (
                            <a
                              href={recordatorio}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-emerald-700 hover:text-emerald-800 bg-emerald-50 rounded-md border border-emerald-200"
                              title="Enviar recordatorio por WhatsApp"
                            >
                              <Share2 className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Saldar de una vez, o reimprimir el recibo si ya se saldó */}
            {selectedPrestamo.estado !== 'saldado' ? (
              <button
                onClick={() => abrirSaldo(selectedPrestamo)}
                className="w-full flex items-center justify-between gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4" /> Saldar préstamo
                </span>
                <span className="tabular-nums">
                  {formatCurrency(calcularSaldoParaSaldar(selectedPrestamo).total)}
                </span>
              </button>
            ) : pagosDelSaldo(selectedPrestamo).length > 0 ? (
              <button
                onClick={() =>
                  setDocumentoPdf({
                    tipo: 'saldo',
                    prestamo: selectedPrestamo,
                    pagos: pagosDelSaldo(selectedPrestamo),
                  })
                }
                className="w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-sm px-4 py-2.5 rounded-xl transition-colors"
              >
                <Receipt className="w-4 h-4" /> Recibo de saldo
              </button>
            ) : null}

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

      {/* Confirmar el saldo: la cifra y su desglose, antes de cobrar */}
      {prestamoSaldando ? (
        (() => {
          const saldo = calcularSaldoParaSaldar(prestamoSaldando);
          return (
            <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
                <div className="flex items-start justify-between border-b border-slate-200 pb-3 gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Saldar préstamo</h3>
                    <p className="text-sm text-slate-500 truncate">
                      {nombreCliente(prestamoSaldando.cliente_id)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSaldandoId(null)}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label="Cerrar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="overflow-y-auto space-y-3 pr-1">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Se liquida
                    </div>
                    {saldo.lineas.map((l) => (
                      <div key={l.cuotaId} className="flex justify-between text-slate-700">
                        <span>
                          {l.numero === 9999 && esRedito(prestamoSaldando) ? 'Capital' : `${esRedito(prestamoSaldando) ? 'Rédito' : 'Cuota'} #${l.numero}`}
                          {l.mora > 0 ? (
                            <span className="text-amber-800"> + mora</span>
                          ) : null}
                        </span>
                        <span className="tabular-nums">
                          {formatCurrency(redondearDinero(l.restante + l.mora))}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Cuotas e intereses:</span>
                      <span className="font-semibold">{formatCurrency(saldo.totalCuotas)}</span>
                    </div>
                    {saldo.totalMora > 0 ? (
                      <div className="flex justify-between text-amber-900">
                        <span>Mora:</span>
                        <span className="font-semibold">{formatCurrency(saldo.totalMora)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 mt-1">
                      <span className="font-bold text-emerald-900">Total para saldar:</span>
                      <span className="text-lg font-black text-emerald-700 tabular-nums">
                        {formatCurrency(saldo.total)}
                      </span>
                    </div>
                  </div>

                  {repartoSaldo && repartoSaldo.saldoDisponible > 0 ? (
                    <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor="saldo-credito" className="text-sm font-semibold text-sky-900">
                          Usar de su saldo a favor
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            cambiarCreditoSaldo(creditoSugerido(repartoSaldo.saldoDisponible, saldo.total))
                          }
                          className="text-xs font-bold text-sky-800 bg-white border border-sky-200 hover:bg-sky-100 rounded-lg px-2 py-1"
                        >
                          Usar lo justo
                        </button>
                      </div>
                      <CampoMoneda id="saldo-credito" value={saldoCredito} onChange={cambiarCreditoSaldo} />
                      <p className="text-[11px] text-sky-900/70">
                        Disponible: {formatCurrency(repartoSaldo.saldoDisponible)}
                      </p>
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="saldo-recibido" className="block text-sm font-semibold text-slate-700 mb-1">
                      Efectivo que recibes
                    </label>
                    <CampoMoneda
                      id="saldo-recibido"
                      value={saldoRecibido}
                      onChange={(monto) => {
                        setSaldoRecibido(monto);
                        setErrorSaldo('');
                      }}
                    />
                    {repartoSaldo && repartoSaldo.excedente > 0 && !repartoSaldo.error ? (
                      <p className="text-xs font-semibold text-sky-800 mt-1">
                        Entrega de más: {formatCurrency(repartoSaldo.excedente)} quedarán a favor del cliente.
                      </p>
                    ) : null}
                  </div>

                  {errorSaldo || repartoSaldo?.error ? (
                    <div
                      role="alert"
                      className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl flex items-start gap-2"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorSaldo || repartoSaldo?.error}</span>
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="saldo-metodo"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Método de pago
                    </label>
                    <select
                      id="saldo-metodo"
                      value={saldoMetodo}
                      onChange={(e) => setSaldoMetodo(e.target.value as MetodoPago)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia bancaria</option>
                      <option value="tarjeta">Tarjeta de crédito o débito</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="saldo-ref"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      Referencia <span className="font-normal text-slate-400">— opcional</span>
                    </label>
                    <input
                      id="saldo-ref"
                      type="text"
                      maxLength={120}
                      value={saldoRef}
                      onChange={(e) => setSaldoRef(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <p className="text-[11px] text-slate-500 leading-snug">
                    Se cobran todas las cuotas pendientes completas, con sus intereses, más la
                    mora. El préstamo queda saldado y no se puede deshacer. Si entrega de más, el
                    resto queda como saldo a favor del cliente.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    onClick={() => setSaldandoId(null)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void confirmarSaldo()}
                    disabled={ejecutando || saldo.total <= 0 || Boolean(repartoSaldo?.error)}
                    className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white transition-colors"
                  >
                    {ejecutando
                      ? 'Saldando…'
                      : repartoSaldo && repartoSaldo.efectivo <= 0 && repartoSaldo.credito > 0
                        ? 'Saldar con su saldo a favor'
                        : `Cobrar ${formatCurrency(repartoSaldo?.efectivo ?? saldo.total)}`}
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      ) : null}

      {/* Comprobante del préstamo o recibo de abono */}
      {documentoPdf ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-md flex items-center justify-center text-white text-sm font-semibold">
              Preparando el documento…
            </div>
          }
        >
          <PrestamoPdfModal
            documento={documentoPdf}
            cliente={state.clientes.find((c) => c.id === documentoPdf.prestamo.cliente_id)}
            settings={state.settings}
            movimientosCredito={state.movimientosCredito}
            onClose={() => setDocumentoPdf(null)}
          />
        </Suspense>
      ) : null}

      {/* Abono a una cuota */}
      {cuotaEnPago ? (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {cuotaEnPago.es_capital ? 'Abonar a capital' : `Cobrar ${etiquetaCuota(cuotaEnPago, prestamoEnPago).toLowerCase()}`}
                </h3>
                <p className="text-sm text-slate-500">
                  {cuotaEnPago.es_capital
                    ? 'Lo que abone baja el rédito desde el próximo periodo'
                    : `Vence ${formatDate(cuotaEnPago.fecha_vencimiento)}`}
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

              {admiteSoloRedito ? (
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl" role="tablist" aria-label="Tipo de cobro">
                  {(
                    [
                      ['normal', 'Cuota completa'],
                      ['solo_redito', 'Rédito + capital'],
                    ] as const
                  ).map(([valor, etiqueta]) => (
                    <button
                      key={valor}
                      type="button"
                      role="tab"
                      aria-selected={modoCobro === valor}
                      onClick={() => {
                        setModoCobro(valor);
                        setPagoCapital(null);
                        setErrorPago('');
                      }}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        modoCobro === valor ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              ) : null}

              {modoCobro === 'solo_redito' && reparto ? (
                <div className="space-y-3">
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Rédito de la cuota:</span>
                      <span className="font-bold text-slate-800">{formatCurrency(cuotaEnPago.interes)}</span>
                    </div>
                    {reparto.yaAbonado > 0 ? (
                      <div className="flex justify-between text-slate-600">
                        <span>Ya abonado:</span>
                        <span className="font-semibold text-emerald-700">{formatCurrency(reparto.yaAbonado)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between text-slate-700 font-semibold">
                      <span>Falta del rédito:</span>
                      <span>{formatCurrency(reparto.faltaRedito)}</span>
                    </div>
                    {reparto.mora > 0 ? (
                      <div className="flex justify-between text-amber-900 font-semibold">
                        <span>Mora:</span>
                        <span>{formatCurrency(reparto.mora)}</span>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor="redito-capital" className="block text-sm font-semibold text-slate-700 mb-1">
                      Abono a capital <span className="font-normal text-slate-400">— opcional</span>
                    </label>
                    <CampoMoneda
                      id="redito-capital"
                      value={pagoCapital}
                      onChange={(monto) => {
                        setPagoCapital(monto);
                        setErrorPago('');
                      }}
                      className="font-black"
                    />
                  </div>

                  <div className="bg-sky-50 border border-sky-200 p-3 rounded-xl text-sm space-y-1">
                    <div className="flex justify-between font-black text-slate-900">
                      <span>Cobras:</span>
                      <span>{formatCurrency(reparto.cobro)}</span>
                    </div>
                    <p className="text-xs text-sky-900 pt-1 leading-snug">
                      {reparto.error ??
                        `Los ${formatCurrency(reparto.capitalQueSeCorre)} de capital que faltan de esta cuota se corren: esta cuota y las siguientes pasan al periodo siguiente y el préstamo termina uno después.`}
                    </p>
                  </div>
                </div>
              ) : null}

              {modoCobro === 'solo_redito' ? null : (
              <>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>{cuotaEnPago.es_capital ? 'Capital prestado:' : esRedito(prestamoEnPago) ? 'Rédito del periodo:' : 'Monto de la cuota:'}</span>
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
                {moraPendiente(cuotaEnPago) > 0 ? (
                  <div className="flex justify-between text-amber-900 font-bold bg-amber-100 p-1.5 rounded mt-1">
                    <span>Mora acumulada:</span>
                    <span>{formatCurrency(moraPendiente(cuotaEnPago))}</span>
                  </div>
                ) : null}
              </div>

              {/* Con mora pendiente el cobro se reparte a mano: el cobrador
                  decide cuánto del dinero que recibe va a cada cosa. Sin
                  mora, el formulario de siempre. */}
              {moraPendiente(cuotaEnPago) > 0 ? (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="cuota-mora"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      A la mora
                    </label>
                    <CampoMoneda
                      id="cuota-mora"
                      value={pagoMora}
                      onChange={(monto) => {
                        setPagoMora(monto);
                        setErrorPago('');
                      }}
                      className="!text-amber-800 font-black"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cuota-monto"
                      className="block text-sm font-semibold text-slate-700 mb-1"
                    >
                      A la cuota
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
                  </div>

                </div>
              ) : (
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
                    {admiteCapital
                      ? 'Puedes abonar menos que el rédito. Si trae más, ponlo en «Abono a capital».'
                      : 'Puedes abonar menos que la cuota; si entrega de más, el resto queda a su favor.'}
                  </p>
                </div>
              )}

              {admiteCapital && prestamoEnPago ? (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label htmlFor="cuota-capital" className="block text-sm font-semibold text-slate-700">
                      Abono a capital <span className="font-normal text-slate-400">— opcional</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setPagoCapital(capitalPendiente(prestamoEnPago));
                        setErrorPago('');
                      }}
                      className="text-xs font-bold text-emerald-700 hover:underline"
                    >
                      Todo el capital
                    </button>
                  </div>
                  <CampoMoneda
                    id="cuota-capital"
                    value={pagoCapital}
                    onChange={(monto) => {
                      setPagoCapital(monto);
                      setErrorPago('');
                    }}
                    className="font-black"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Debe de capital {formatCurrency(capitalPendiente(prestamoEnPago))}. Lo que abone baja el rédito
                    desde el próximo periodo.
                  </p>
                </div>
              ) : null}

              {repartoAbono && repartoAbono.saldoDisponible > 0 ? (
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="cuota-credito" className="text-sm font-semibold text-sky-900">
                      Usar de su saldo a favor
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        // El saldo es para cubrir la deuda: si se escribió de
                        // más, el monto se ajusta a lo que resta de la cuota
                        const aCuota = Math.min(repartoAbono.aCuota || repartoAbono.restante, repartoAbono.restante);
                        setPagoMonto(aCuota);
                        setPagoCredito(
                          creditoSugerido(repartoAbono.saldoDisponible, repartoAbono.aMora + aCuota)
                        );
                        setErrorPago('');
                      }}
                      className="text-xs font-bold text-sky-800 bg-white border border-sky-200 hover:bg-sky-100 rounded-lg px-2 py-1"
                    >
                      Usar lo justo
                    </button>
                  </div>
                  <CampoMoneda
                    id="cuota-credito"
                    value={pagoCredito}
                    onChange={(monto) => {
                      setPagoCredito(monto);
                      setErrorPago('');
                    }}
                  />
                  <p className="text-[11px] text-sky-900/70">
                    Disponible: {formatCurrency(repartoAbono.saldoDisponible)}
                  </p>
                </div>
              ) : null}

              {repartoAbono ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-sm space-y-1">
                  {repartoAbono.credito > 0 ? (
                    <div className="flex justify-between text-sky-900">
                      <span>Con su saldo a favor:</span>
                      <span className="font-semibold">−{formatCurrency(repartoAbono.credito)}</span>
                    </div>
                  ) : null}
                  {repartoAbono.excedente > 0 ? (
                    <div className="flex justify-between text-sky-900">
                      <span>Queda a su favor:</span>
                      <span className="font-semibold">{formatCurrency(repartoAbono.excedente)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-emerald-900">Efectivo que recibes:</span>
                    <span className="font-black text-emerald-700">
                      {formatCurrency(
                        redondearDinero(Math.max(0, repartoAbono.efectivo) + (admiteCapital ? pagoCapital ?? 0 : 0))
                      )}
                    </span>
                  </div>
                </div>
              ) : null}

              </>
              )}

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
                  {ejecutando
                    ? 'Registrando…'
                    : modoCobro === 'solo_redito'
                    ? (pagoCapital ?? 0) > 0
                      ? 'Cobrar rédito + capital'
                      : 'Cobrar el rédito'
                    : 'Confirmar abono'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
