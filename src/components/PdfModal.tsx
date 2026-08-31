import React from 'react';
import type { Cotizacion, Factura, Cliente, BusinessSettings } from '../types';
import { mensajeDocumento } from '../utils/whatsapp';
import { VistaPreviaModal } from './documentos/VistaPreviaModal';
import { DocumentoA4 } from './documentos/DocumentoA4';
import { DocumentoTermico } from './documentos/DocumentoTermico';

interface PdfModalProps {
  type: 'cotizacion' | 'factura';
  doc: Cotizacion | Factura;
  cliente?: Cliente;
  settings: BusinessSettings;
  onClose: () => void;
}

/** Vista previa de una cotización o factura, en hoja o en rollo térmico. */
export const PdfModal: React.FC<PdfModalProps> = ({ type, doc, cliente, settings, onClose }) => {
  const esFactura = type === 'factura';

  return (
    <VistaPreviaModal
      titulo={`Vista previa · ${doc.numero}`}
      archivoBase={doc.numero}
      tituloCompartir={`${esFactura ? 'Factura' : 'Cotización'} ${doc.numero}`}
      textoWhatsapp={mensajeDocumento(type, doc, cliente, settings)}
      telefono={cliente?.telefono}
      onClose={onClose}
    >
      {({ id, formato, termico }) =>
        termico ? (
          <DocumentoTermico
            id={id}
            type={type}
            doc={doc}
            cliente={cliente}
            settings={settings}
            formato={formato}
          />
        ) : (
          <DocumentoA4 id={id} type={type} doc={doc} cliente={cliente} settings={settings} />
        )
      }
    </VistaPreviaModal>
  );
};
