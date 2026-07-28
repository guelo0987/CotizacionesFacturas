import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Se muestra cuando faltan las variables de entorno de Supabase.
 *
 * Antes, si faltaban, la aplicación se conectaba a un proyecto cableado en
 * el código y todos los negocios acababan compartiendo la misma base de
 * datos. Ahora falla de forma visible.
 */
export const ConfiguracionFaltanteView: React.FC = () => (
  <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 font-sans">
    <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-5">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-amber-600" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-bold text-slate-900">Falta configurar la aplicación</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          No se encontraron las credenciales del proyecto de base de datos. Sin ellas la
          aplicación no puede conectarse a ningún sitio.
        </p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Variables requeridas
        </p>
        <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-all">
          VITE_SUPABASE_URL{'\n'}VITE_SUPABASE_ANON_KEY
        </pre>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        En desarrollo se definen en el archivo <code className="font-mono">.env</code> de la raíz
        del proyecto. En producción, en las variables de entorno del despliegue. Después de
        cambiarlas hay que reconstruir la aplicación.
      </p>
    </div>
  </div>
);
