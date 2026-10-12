import React from 'react';
import type { BusinessSettings, Cliente, Cuota, MovimientoCredito, Pago, Prestamo } from '../types';
import { mensajeAbono, mensajePrestamo, mensajeSaldo } from '../utils/whatsapp';
import { VistaPreviaModal } from './documentos/VistaPreviaModal';
import { referenciaAbono, referenciaPrestamo } from '../utils/documentosPrestamo';
import {
  ComprobantePrestamoA4,
  ComprobantePrestamoTermico,
} from './documentos/DocumentoPrestamo';
import { ReciboAbonoA4, ReciboAbonoTermico } from './documentos/DocumentoAbono';
import { ReciboSaldoA4, ReciboSaldoTermico } from './documentos/DocumentoSaldo';
import { saldoClienteHasta } from '../utils/creditos';

/**
 * Qué se está imprimiendo: el comprobante del préstamo completo, el recibo
 * de un abono concreto o el recibo del saldo del préstamo.
 */
export type DocumentoPrestamo =
  | { tipo: 'prestamo'; prestamo: Prestamo }
  | { tipo: 'abono'; prestamo: Prestamo; cuota: Cuota; pago: Pago }
  | { tipo: 'saldo'; prestamo: Prestamo; pagos: Pago[] };

interface PrestamoPdfModalProps {
  documento: DocumentoPrestamo;
  cliente?: Cliente;
  settings: BusinessSettings;
  /** Libro de saldo a favor, para que el recibo diga cuánto le quedó al cliente. */
  movimientosCredito?: MovimientoCredito[];
  onClose: () => void;
}

/**
 * Saldo a favor del cliente justo después de un pago; `null` si hasta ese
 * momento nunca había tenido, para no llenar recibos viejos de ceros.
 */
function saldoTrasPago(
  movimientos: MovimientoCredito[] | undefined,
  cliente: Cliente | undefined,
  fecha: string | undefined
): number | null {
  if (!cliente || !fecha) return null;
  const limite = Date.parse(fecha);
  const previos = (movimientos ?? []).filter(
    (m) => m.cliente_id === cliente.id && Date.parse(m.fecha) <= limite
  );
  return previos.length > 0 ? saldoClienteHasta(previos, cliente.id, fecha) : null;
}

/** Vista previa del comprobante de préstamo o del recibo de abono. */
export const PrestamoPdfModal: React.FC<PrestamoPdfModalProps> = ({
  documento,
  cliente,
  settings,
  movimientosCredito,
  onClose,
}) => {
  if (documento.tipo === 'saldo') {
    const { prestamo, pagos } = documento;
    const referencia = `SAL-${prestamo.id.slice(0, 8).toUpperCase()}`;
    const saldoAFavor = saldoTrasPago(movimientosCredito, cliente, pagos[0]?.fecha);

    return (
      <VistaPreviaModal
        titulo={`Recibo de saldo · ${referencia}`}
        subtitulo={`${pagos.length} cuota${pagos.length === 1 ? '' : 's'} liquidada${pagos.length === 1 ? '' : 's'} · préstamo saldado`}
        archivoBase={referencia}
        tituloCompartir={`Recibo de saldo ${referencia}`}
        textoWhatsapp={mensajeSaldo(prestamo, pagos, cliente, settings, saldoAFavor)}
        telefono={cliente?.telefono}
        onClose={onClose}
      >
        {({ id, formato, termico }) =>
          termico ? (
            <ReciboSaldoTermico
              id={id}
              prestamo={prestamo}
              pagos={pagos}
              cliente={cliente}
              settings={settings}
              formato={formato}
              saldoAFavor={saldoAFavor}
            />
          ) : (
            <ReciboSaldoA4
              id={id}
              prestamo={prestamo}
              pagos={pagos}
              cliente={cliente}
              settings={settings}
              saldoAFavor={saldoAFavor}
            />
          )
        }
      </VistaPreviaModal>
    );
  }

  if (documento.tipo === 'abono') {
    const { prestamo, cuota, pago } = documento;
    const referencia = referenciaAbono(pago);
    const saldoAFavor = saldoTrasPago(movimientosCredito, cliente, pago.fecha);

    return (
      <VistaPreviaModal
        titulo={`Recibo de abono · ${referencia}`}
        subtitulo={`Cuota #${cuota.numero} de ${prestamo.num_cuotas}`}
        archivoBase={referencia}
        tituloCompartir={`Recibo de abono ${referencia}`}
        textoWhatsapp={mensajeAbono(prestamo, cuota, pago, cliente, settings, saldoAFavor)}
        telefono={cliente?.telefono}
        onClose={onClose}
      >
        {({ id, formato, termico }) =>
          termico ? (
            <ReciboAbonoTermico
              id={id}
              prestamo={prestamo}
              cuota={cuota}
              pago={pago}
              cliente={cliente}
              settings={settings}
              formato={formato}
              saldoAFavor={saldoAFavor}
            />
          ) : (
            <ReciboAbonoA4
              id={id}
              prestamo={prestamo}
              cuota={cuota}
              pago={pago}
              cliente={cliente}
              settings={settings}
              saldoAFavor={saldoAFavor}
            />
          )
        }
      </VistaPreviaModal>
    );
  }

  const { prestamo } = documento;
  const referencia = referenciaPrestamo(prestamo);

  return (
    <VistaPreviaModal
      titulo={`Comprobante de préstamo · ${referencia}`}
      subtitulo={`${prestamo.num_cuotas} cuotas · listo para imprimir o descargar`}
      archivoBase={referencia}
      tituloCompartir={`Comprobante de préstamo ${referencia}`}
      textoWhatsapp={mensajePrestamo(prestamo, cliente, settings)}
      telefono={cliente?.telefono}
      onClose={onClose}
    >
      {({ id, formato, termico }) =>
        termico ? (
          <ComprobantePrestamoTermico
            id={id}
            prestamo={prestamo}
            cliente={cliente}
            settings={settings}
            formato={formato}
          />
        ) : (
          <ComprobantePrestamoA4
            id={id}
            prestamo={prestamo}
            cliente={cliente}
            settings={settings}
          />
        )
      }
    </VistaPreviaModal>
  );
};
