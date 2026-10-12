import React from 'react';
import type { BusinessSettings, Cliente, MovimientoCredito } from '../types';
import { VistaPreviaModal } from './documentos/VistaPreviaModal';
import { ComprobanteCreditoA4, ComprobanteCreditoTermico } from './documentos/DocumentoCredito';
import { referenciaMovimiento } from '../utils/creditos';
import { mensajeMovimientoCredito } from '../utils/whatsapp';

interface CreditoPdfModalProps {
  movimiento: MovimientoCredito;
  saldoDespues: number;
  cliente?: Cliente;
  settings: BusinessSettings;
  onClose: () => void;
}

/** Vista previa del recibo de un anticipo o del comprobante de una devolución. */
export const CreditoPdfModal: React.FC<CreditoPdfModalProps> = ({
  movimiento,
  saldoDespues,
  cliente,
  settings,
  onClose,
}) => {
  const referencia = referenciaMovimiento(movimiento);
  const esDevolucion = movimiento.tipo === 'devolucion';

  return (
    <VistaPreviaModal
      titulo={`${esDevolucion ? 'Devolución de saldo' : 'Recibo de anticipo'} · ${referencia}`}
      subtitulo={cliente?.nombre}
      archivoBase={referencia}
      tituloCompartir={`${esDevolucion ? 'Devolución de saldo' : 'Recibo de anticipo'} ${referencia}`}
      textoWhatsapp={mensajeMovimientoCredito(movimiento, saldoDespues, cliente, settings)}
      telefono={cliente?.telefono}
      onClose={onClose}
    >
      {({ id, formato, termico }) =>
        termico ? (
          <ComprobanteCreditoTermico
            id={id}
            movimiento={movimiento}
            saldoDespues={saldoDespues}
            cliente={cliente}
            settings={settings}
            formato={formato}
          />
        ) : (
          <ComprobanteCreditoA4
            id={id}
            movimiento={movimiento}
            saldoDespues={saldoDespues}
            cliente={cliente}
            settings={settings}
          />
        )
      }
    </VistaPreviaModal>
  );
};
