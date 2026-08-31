import React from 'react';
import type { BusinessSettings, Cliente, Cuota, Pago, Prestamo } from '../types';
import { mensajeAbono, mensajePrestamo } from '../utils/whatsapp';
import { VistaPreviaModal } from './documentos/VistaPreviaModal';
import { referenciaAbono, referenciaPrestamo } from '../utils/documentosPrestamo';
import {
  ComprobantePrestamoA4,
  ComprobantePrestamoTermico,
} from './documentos/DocumentoPrestamo';
import { ReciboAbonoA4, ReciboAbonoTermico } from './documentos/DocumentoAbono';

/**
 * Qué se está imprimiendo: el comprobante del préstamo completo, con su
 * calendario, o el recibo de un abono concreto.
 */
export type DocumentoPrestamo =
  | { tipo: 'prestamo'; prestamo: Prestamo }
  | { tipo: 'abono'; prestamo: Prestamo; cuota: Cuota; pago: Pago };

interface PrestamoPdfModalProps {
  documento: DocumentoPrestamo;
  cliente?: Cliente;
  settings: BusinessSettings;
  onClose: () => void;
}

/** Vista previa del comprobante de préstamo o del recibo de abono. */
export const PrestamoPdfModal: React.FC<PrestamoPdfModalProps> = ({
  documento,
  cliente,
  settings,
  onClose,
}) => {
  if (documento.tipo === 'abono') {
    const { prestamo, cuota, pago } = documento;
    const referencia = referenciaAbono(pago);

    return (
      <VistaPreviaModal
        titulo={`Recibo de abono · ${referencia}`}
        subtitulo={`Cuota #${cuota.numero} de ${prestamo.num_cuotas}`}
        archivoBase={referencia}
        tituloCompartir={`Recibo de abono ${referencia}`}
        textoWhatsapp={mensajeAbono(prestamo, cuota, pago, cliente, settings)}
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
            />
          ) : (
            <ReciboAbonoA4
              id={id}
              prestamo={prestamo}
              cuota={cuota}
              pago={pago}
              cliente={cliente}
              settings={settings}
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
