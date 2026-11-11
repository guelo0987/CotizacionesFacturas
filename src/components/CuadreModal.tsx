import React, { useMemo, useState } from 'react';
import type { AppState } from '../types';
import { VistaPreviaModal } from './documentos/VistaPreviaModal';
import { CuadreA4, CuadreTermico } from './documentos/DocumentoCuadre';
import { calcularCuadre, fechaLarga, horaDe, moverDia } from '../utils/cuadre';
import { formatCurrency, formatDate, hoyLocal } from '../utils/sanitizer';
import { mensajeCuadre } from '../utils/whatsapp';
import { descargarCSV, generarCSV } from '../utils/exportar';
import { METODOS_PAGO } from '../utils/documentosPrestamo';
import { useFeedback } from './feedback/contexto';
import { ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';

interface CuadreModalProps {
  state: AppState;
  onClose: () => void;
}

/**
 * Cuadre del día: cuánto dinero entró y salió en una fecha, listo para
 * imprimir en hoja o en rollo, mandar por WhatsApp o bajar a Excel.
 */
export const CuadreModal: React.FC<CuadreModalProps> = ({ state, onClose }) => {
  const { exito, error: avisarError } = useFeedback();
  const hoy = hoyLocal();
  const [dia, setDia] = useState(hoy);
  const cuadre = useMemo(() => calcularCuadre(state, dia), [state, dia]);

  const exportar = () => {
    try {
      const csv = generarCSV(
        ['Fecha', 'Hora', 'Cliente', 'Concepto', 'Método', 'Entrada', 'Salida', 'De eso, mora', 'Con saldo a favor', 'Quedó a favor'],
        cuadre.renglones.map((r) => [
          formatDate(dia),
          horaDe(r.fecha),
          r.cliente,
          r.concepto,
          r.metodo ? METODOS_PAGO[r.metodo] ?? r.metodo : '',
          r.entrada,
          r.salida,
          r.mora,
          r.creditoUsado,
          r.excedente,
        ])
      );
      descargarCSV(`cuadre_${dia}`, csv);
      exito('Archivo descargado.');
    } catch (e) {
      avisarError(e instanceof Error ? e.message : 'No se pudo generar el archivo.');
    }
  };

  const boton =
    'flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed';

  const controles = (
    <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Día</span>
      <button className={boton} onClick={() => setDia(moverDia(dia, -1))} aria-label="Día anterior">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <input
        type="date"
        value={dia}
        max={hoy}
        onChange={(e) => e.target.value && setDia(e.target.value)}
        aria-label="Fecha del cuadre"
        className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
      />
      <button
        className={boton}
        onClick={() => setDia(moverDia(dia, 1))}
        disabled={dia >= hoy}
        aria-label="Día siguiente"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      {dia !== hoy ? (
        <button className={boton} onClick={() => setDia(hoy)}>
          Hoy
        </button>
      ) : null}
      <button className={boton} onClick={exportar} disabled={cuadre.renglones.length === 0}>
        <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel
      </button>
      <span className="text-xs text-slate-600 ml-auto">
        Recogido <strong className="text-emerald-700">{formatCurrency(cuadre.entradas.total)}</strong> · Neto{' '}
        <strong className="text-slate-900">{formatCurrency(cuadre.neto)}</strong>
      </span>
    </div>
  );

  return (
    <VistaPreviaModal
      titulo="Cuadre del día"
      subtitulo={fechaLarga(dia)}
      archivoBase={`cuadre-${dia}`}
      tituloCompartir={`Cuadre del día ${formatDate(dia)}`}
      textoWhatsapp={mensajeCuadre(cuadre, state.settings)}
      controles={controles}
      onClose={onClose}
    >
      {({ id, formato, termico }) =>
        termico ? (
          <CuadreTermico id={id} cuadre={cuadre} settings={state.settings} formato={formato} />
        ) : (
          <CuadreA4 id={id} cuadre={cuadre} settings={state.settings} />
        )
      }
    </VistaPreviaModal>
  );
};
