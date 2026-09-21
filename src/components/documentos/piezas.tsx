import React from 'react';
import type { BusinessSettings } from '../../types';
import { formatDocumento, formatTelefono } from '../../utils/sanitizer';
import { FORMATOS, PX_POR_MM, type FormatoImpresion } from '../../utils/formatosImpresion';

/**
 * Trozos que comparten todos los documentos imprimibles —cotización,
 * factura, comprobante de préstamo y recibo de abono—: la identidad del
 * negocio arriba y su código QR al pie.
 */

// =====================================================================
// Hoja A4
// =====================================================================

/** Columna izquierda de la cabecera: logo y datos del negocio. */
export const DatosNegocioA4: React.FC<{ settings: BusinessSettings }> = ({ settings }) => (
  <div className="space-y-1.5">
    {settings.logo_url ? (
      <img src={settings.logo_url} alt="" className="max-h-16 rounded object-contain mb-2" />
    ) : null}
    <h1 className="text-xl font-black text-slate-900 tracking-tight leading-tight">
      {settings.business_name || 'Nombre del negocio'}
    </h1>
    {settings.documento ? (
      <p className="text-xs text-slate-600 font-mono">RNC: {formatDocumento(settings.documento)}</p>
    ) : null}
    <p className="text-xs text-slate-600">
      {settings.address ? `${settings.address} · ` : ''}
      {formatTelefono(settings.phone)}
    </p>
    {settings.email ? <p className="text-xs text-slate-600">{settings.email}</p> : null}
  </div>
);

/** Recuadro de la derecha con el tipo de documento y su número. */
export const TituloDocumentoA4: React.FC<{ titulo: string; numero?: string; children?: React.ReactNode }> = ({
  titulo,
  numero,
  children,
}) => (
  <div className="text-right space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200 min-w-[200px]">
    <h2 className="text-lg font-black text-slate-900 uppercase tracking-wide">{titulo}</h2>
    {numero ? <div className="text-sm font-bold text-emerald-700 font-mono">{numero}</div> : null}
    {children}
  </div>
);

/** Pie con la nota legal y el código QR del negocio. */
export const PieDocumentoA4: React.FC<{ settings: BusinessSettings }> = ({ settings }) => (
  // Nunca partido entre dos páginas: el QR cortado por la mitad no se lee
  <div className="pt-6 border-t border-slate-200 flex items-end justify-between gap-4 break-inside-avoid">
    <div className="text-[10px] text-slate-400">
      Documento generado electrónicamente por{' '}
      {settings.business_name || 'Sistema de Cotizaciones y Facturas'}.
    </div>

    {settings.qr_url ? (
      <div className="text-center shrink-0">
        <img
          src={settings.qr_url}
          alt="Código QR del negocio"
          className="w-24 h-24 object-contain mx-auto"
        />
        <div className="text-[10px] font-semibold text-slate-600 mt-1">
          Síguenos en nuestras redes
        </div>
      </div>
    ) : null}
  </div>
);

// =====================================================================
// Rollo térmico
// =====================================================================

/** Separador de guiones, como el de un recibo de caja. */
export const Separador: React.FC = () => (
  <div aria-hidden="true" className="border-t border-dashed border-black my-1.5" />
);

/** Cabecera centrada con el logo y los datos del negocio. */
export const CabeceraTermica: React.FC<{ settings: BusinessSettings; estrecho: boolean }> = ({
  settings,
  estrecho,
}) => (
  <div className="text-center space-y-0.5">
    {settings.logo_url ? (
      <img
        src={settings.logo_url}
        alt=""
        className={`${estrecho ? 'max-h-20' : 'max-h-24'} object-contain mx-auto mb-1`}
      />
    ) : null}
    <div
      className={`${estrecho ? 'text-[12px]' : 'text-[14px]'} font-bold uppercase leading-tight`}
    >
      {settings.business_name || 'Nombre del negocio'}
    </div>
    {settings.documento ? <div>RNC: {formatDocumento(settings.documento)}</div> : null}
    {settings.address ? <div>{settings.address}</div> : null}
    {settings.phone ? <div>Tel: {formatTelefono(settings.phone)}</div> : null}
    {settings.email ? <div className="break-all">{settings.email}</div> : null}
  </div>
);

/**
 * Código QR al pie del recibo.
 *
 * Se mide por su ancho y no encajado en un cuadro: la imagen trae la
 * etiqueta «SCAN ME» debajo, así que ajustarla por altura dejaba los
 * módulos del código a ~19 mm, al límite de lo que un lector saca de un
 * papel térmico. A 40 mm (32 mm en el rollo estrecho) se lee sin pelear.
 */
export const PieTermico: React.FC<{ settings: BusinessSettings; estrecho: boolean }> = ({
  settings,
  estrecho,
}) => {
  if (!settings.qr_url) return <div className="h-6" />;

  return (
    <>
      <div className="text-center mt-2">
        <img
          src={settings.qr_url}
          alt="Código QR del negocio"
          style={{ width: Math.round((estrecho ? 32 : 40) * PX_POR_MM) }}
          className="h-auto mx-auto"
        />
        <div className="font-bold mt-0.5">Síguenos en nuestras redes</div>
      </div>

      {/* El rollo necesita aire al final: la cuchilla corta unos milímetros
          por debajo del último punto impreso. */}
      <div className="h-6" />
    </>
  );
};

/** Envoltorio del recibo, con el ancho exacto del rollo. */
export const HojaTermica: React.FC<{
  id: string;
  formato: FormatoImpresion;
  children: React.ReactNode;
}> = ({ id, formato, children }) => (
  <div
    id={id}
    style={{ width: FORMATOS[formato].anchoPx }}
    className={`documento-termico bg-white text-black font-mono ${
      formato === '58mm' ? 'text-[9px]' : 'text-[10px]'
    } leading-tight mx-auto`}
  >
    {children}
  </div>
);

/** Fila de etiqueta e importe alineados a los extremos. */
export const FilaTermica: React.FC<{ etiqueta: string; valor: string; fuerte?: boolean }> = ({
  etiqueta,
  valor,
  fuerte,
}) => (
  <div className={`flex justify-between gap-2 ${fuerte ? 'font-bold' : ''}`}>
    <span>{etiqueta}</span>
    <span className="tabular-nums whitespace-nowrap">{valor}</span>
  </div>
);
