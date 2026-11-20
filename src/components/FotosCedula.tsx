import React, { useEffect, useRef, useState } from 'react';
import type { Cliente, LadoCedula } from '../types';
import { supabaseDataService } from '../services/supabaseDataService';
import { useFeedback, mensajeDeError } from './feedback/contexto';
import { Camera, IdCard, Loader2, RefreshCw, Trash2, X } from 'lucide-react';

interface FotosCedulaProps {
  cliente: Cliente;
  onSubir: (cliente: Cliente, lado: LadoCedula, archivo: File) => Promise<void>;
  onQuitar: (cliente: Cliente, lado: LadoCedula) => Promise<void>;
}

const LADOS: { lado: LadoCedula; etiqueta: string; columna: 'foto_cedula_frente' | 'foto_cedula_detras' }[] = [
  { lado: 'frente', etiqueta: 'Cédula (frente)', columna: 'foto_cedula_frente' },
  { lado: 'detras', etiqueta: 'Cédula (detrás)', columna: 'foto_cedula_detras' },
];

// Los enlaces firmados duran una hora: se reusan mientras tanto para no
// pedirlos de nuevo cada vez que se abre la ficha.
const enlaces = new Map<string, { url: string; vence: number }>();
const VIGENCIA_MS = 50 * 60 * 1000;

async function enlaceDe(ruta: string): Promise<string> {
  const guardado = enlaces.get(ruta);
  if (guardado && guardado.vence > Date.now()) return guardado.url;
  const url = await supabaseDataService.urlFotoCliente(ruta);
  enlaces.set(ruta, { url, vence: Date.now() + VIGENCIA_MS });
  return url;
}

/** Miniatura de una foto guardada: pide su enlace firmado y la muestra. */
const Miniatura: React.FC<{ ruta: string; alt: string; onAbrir: (url: string) => void }> = ({ ruta, alt, onAbrir }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    setUrl(null);
    setFallo(false);
    enlaceDe(ruta)
      .then((u) => vigente && setUrl(u))
      .catch(() => vigente && setFallo(true));
    return () => {
      vigente = false;
    };
  }, [ruta]);

  if (fallo) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[11px] text-red-600 font-semibold p-2 text-center">
        No se pudo cargar la foto
      </div>
    );
  }
  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onAbrir(url)} className="w-full h-full" aria-label={`Ver ${alt} en grande`}>
      <img src={url} alt={alt} className="w-full h-full object-cover" onError={() => setFallo(true)} />
    </button>
  );
};

/**
 * Las dos fotos de la cédula del cliente, dentro de su ficha. Se suben
 * desde la cámara o la galería, se ven en grande al tocarlas y se pueden
 * cambiar o quitar.
 */
export const FotosCedula: React.FC<FotosCedulaProps> = ({ cliente, onSubir, onQuitar }) => {
  const { error: avisarError, confirmar } = useFeedback();
  const [ocupado, setOcupado] = useState<LadoCedula | null>(null);
  const [grande, setGrande] = useState<{ url: string; etiqueta: string } | null>(null);
  const entradas = useRef<Record<LadoCedula, HTMLInputElement | null>>({ frente: null, detras: null });

  // Escape cierra la foto en grande
  useEffect(() => {
    if (!grande) return;
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && setGrande(null);
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [grande]);

  const elegir = (lado: LadoCedula) => entradas.current[lado]?.click();

  const alElegir = async (lado: LadoCedula, e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // Para poder elegir la misma foto otra vez
    if (!archivo) return;
    setOcupado(lado);
    try {
      await onSubir(cliente, lado, archivo);
    } catch (err) {
      avisarError(mensajeDeError(err));
    } finally {
      setOcupado(null);
    }
  };

  const quitar = async (lado: LadoCedula, etiqueta: string) => {
    const ok = await confirmar({
      titulo: 'Quitar foto',
      mensaje: `¿Quitar la foto «${etiqueta}» de ${cliente.nombre}? Se borra y no se puede recuperar.`,
      textoConfirmar: 'Quitar',
      peligroso: true,
    });
    if (!ok) return;
    setOcupado(lado);
    try {
      await onQuitar(cliente, lado);
    } catch (err) {
      avisarError(mensajeDeError(err));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
      <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
        <IdCard className="w-4 h-4 text-slate-500" /> Fotos de la cédula
      </h4>

      <div className="grid grid-cols-2 gap-2">
        {LADOS.map(({ lado, etiqueta, columna }) => {
          const ruta = cliente[columna] ?? null;
          const trabajando = ocupado === lado;
          return (
            <div key={lado} className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500">{etiqueta}</div>
              <div className="relative aspect-[3/2] rounded-lg overflow-hidden border border-slate-200 bg-white">
                {ruta ? (
                  <Miniatura ruta={ruta} alt={etiqueta} onAbrir={(url) => setGrande({ url, etiqueta })} />
                ) : (
                  <button
                    type="button"
                    onClick={() => elegir(lado)}
                    disabled={trabajando}
                    className="w-full h-full flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-xs font-bold">Subir foto</span>
                  </button>
                )}
                {trabajando ? (
                  <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-1">
                    <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                    <span className="text-[11px] font-semibold text-slate-600">Guardando…</span>
                  </div>
                ) : null}
              </div>

              {ruta ? (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => elegir(lado)}
                    disabled={trabajando}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" /> Cambiar
                  </button>
                  <button
                    type="button"
                    onClick={() => void quitar(lado, etiqueta)}
                    disabled={trabajando}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold border border-slate-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Quitar ${etiqueta}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : null}

              <input
                ref={(el) => {
                  entradas.current[lado] = el;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label={`Elegir foto: ${etiqueta}`}
                onChange={(e) => void alElegir(lado, e)}
              />
            </div>
          );
        })}
      </div>

      {grande ? (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/90 flex flex-col items-center justify-center p-4"
          onClick={() => setGrande(null)}
          role="dialog"
          aria-modal="true"
          aria-label={grande.etiqueta}
        >
          <button
            type="button"
            onClick={() => setGrande(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Cerrar foto"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="text-white text-sm font-semibold mb-3">
            {cliente.nombre} · {grande.etiqueta}
          </div>
          <img
            src={grande.url}
            alt={grande.etiqueta}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
};
