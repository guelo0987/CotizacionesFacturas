import React, { useState } from 'react';
import type { Cotizacion, Factura, Cliente, BusinessSettings } from '../types';
import {
  compartirArchivo,
  descargarArchivo,
  generarPdfFile,
  generatePdfFromElement,
  printDocumentElement,
} from '../utils/pdfGenerator';
import {
  FORMATOS,
  FORMATOS_VALIDOS,
  type FormatoImpresion,
} from '../utils/formatosImpresion';
import { construirUrl, mensajeDocumento } from '../utils/whatsapp';
import { useFeedback, mensajeDeError } from './feedback/contexto';
import { DocumentoA4 } from './documentos/DocumentoA4';
import { DocumentoTermico } from './documentos/DocumentoTermico';
import { FileDown, Printer, Share2, X } from 'lucide-react';

interface PdfModalProps {
  type: 'cotizacion' | 'factura';
  doc: Cotizacion | Factura;
  cliente?: Cliente;
  settings: BusinessSettings;
  onClose: () => void;
}

export const PdfModal: React.FC<PdfModalProps> = ({ type, doc, cliente, settings, onClose }) => {
  const { error: avisarError, info: avisarInfo } = useFeedback();
  const [generando, setGenerando] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [formato, setFormato] = useState<FormatoImpresion>('a4');

  const isInvoice = type === 'factura';
  const definicion = FORMATOS[formato];

  // El id incluye el formato para que React monte un nodo nuevo al
  // cambiarlo: así nunca se captura el documento del formato anterior.
  const documentElementId = `pdf-document-${doc.id}-${formato}`;
  const filename = `${doc.numero}${definicion.termico ? `-${definicion.etiqueta.replace(' ', '')}` : ''}.pdf`;

  const descargar = async () => {
    setGenerando(true);
    try {
      await generatePdfFromElement(documentElementId, filename, formato);
    } catch (e) {
      avisarError(mensajeDeError(e));
    } finally {
      setGenerando(false);
    }
  };

  /**
   * Comparte el PDF, no un enlace.
   *
   * El destinatario no se elige aquí: se entrega el archivo a la hoja de
   * compartir del sistema y es el propio WhatsApp quien muestra la lista de
   * contactos. En escritorio, donde no se pueden compartir archivos, se
   * descarga el PDF y se abre WhatsApp Web con el resumen para adjuntarlo.
   */
  const compartir = async () => {
    setCompartiendo(true);
    try {
      const archivo = await generarPdfFile(documentElementId, filename, formato);
      const texto = mensajeDocumento(type, doc, cliente, settings);
      const titulo = `${isInvoice ? 'Factura' : 'Cotización'} ${doc.numero}`;

      const resultado = await compartirArchivo(archivo, titulo, texto);

      if (resultado === 'sin-soporte') {
        descargarArchivo(archivo);
        window.open(construirUrl(texto, cliente?.telefono), '_blank', 'noopener,noreferrer');
        avisarInfo(
          'Este navegador no puede enviar archivos directamente: descargamos el PDF y abrimos WhatsApp para que lo adjuntes.'
        );
      }
    } catch (e) {
      avisarError(mensajeDeError(e));
    } finally {
      setCompartiendo(false);
    }
  };

  const imprimir = () => {
    try {
      printDocumentElement(documentElementId, formato);
    } catch (e) {
      avisarError(mensajeDeError(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-start sm:items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-4 space-y-3 shadow-2xl max-h-[95vh] flex flex-col my-4">
        <div className="flex items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3 no-print flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Vista previa · {doc.numero}</h3>
            <p className="text-[11px] text-slate-500">Listo para imprimir o descargar en PDF.</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={descargar}
              disabled={generando || compartiendo}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-all shadow-sm"
            >
              <FileDown className="w-4 h-4" /> {generando ? 'Generando…' : 'Descargar PDF'}
            </button>

            <button
              onClick={imprimir}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold text-xs px-3 py-1.5 rounded-xl transition-all"
            >
              <Printer className="w-4 h-4 text-slate-500" /> Imprimir
            </button>

            <button
              onClick={compartir}
              disabled={compartiendo || generando}
              className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs px-3 py-1.5 rounded-xl transition-all"
            >
              <Share2 className="w-4 h-4" /> {compartiendo ? 'Preparando…' : 'WhatsApp'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700"
              aria-label="Cerrar vista previa"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Formato de papel. La vista previa cambia con él, así que lo que
            se ve en pantalla es exactamente lo que sale por la impresora. */}
        <div className="no-print flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Formato
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FORMATOS_VALIDOS.map((id) => (
              <button
                key={id}
                onClick={() => setFormato(id)}
                title={FORMATOS[id].detalle}
                aria-pressed={formato === id}
                className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all ${
                  formato === id
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {FORMATOS[id].etiqueta}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-500">{definicion.detalle}</span>
        </div>

        {/* El documento tiene un ancho fijo y no depende de puntos de
            corte responsivos: así el PDF y la impresión salen idénticos
            desde un móvil o desde un ordenador. En pantallas estrechas la
            vista previa se desplaza en horizontal. */}
        <div className="overflow-auto pr-1 flex-1 bg-slate-100 p-2 sm:p-4 rounded-xl border border-slate-200">
          {definicion.termico ? (
            <DocumentoTermico
              id={documentElementId}
              type={type}
              doc={doc}
              cliente={cliente}
              settings={settings}
              formato={formato}
            />
          ) : (
            <DocumentoA4
              id={documentElementId}
              type={type}
              doc={doc}
              cliente={cliente}
              settings={settings}
            />
          )}
        </div>
      </div>
    </div>
  );
};
