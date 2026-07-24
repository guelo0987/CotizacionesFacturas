import React, { useState } from 'react';
import {
  HelpCircle,
  X,
  ChevronRight,
  ChevronLeft,
  Building,
  Users,
  Wrench,
  FileText,
  Landmark,
  Share2,
  CheckCircle2,
  Play,
} from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      title: '¡Bienvenido a tu Sistema de Gestión!',
      icon: <HelpCircle className="w-8 h-8 text-emerald-400" />,
      description:
        'Esta guía rápida te enseñará en 6 sencillos pasos cómo administrar tu negocio de servicios, crear cotizaciones, cobrar facturas y gestionar préstamos.',
      tips: [
        'Diseñado para celular (Mobile-First) y computador.',
        'Toda la información se guarda automáticamente.',
        'Puedes encender o apagar este tutorial en cualquier momento.',
      ],
    },
    {
      title: '1. Configura tu Negocio (Ajustes)',
      icon: <Building className="w-8 h-8 text-blue-400" />,
      description:
        'Dirígete al icono de engranaje (⚙️) arriba a la derecha para personalizar tu membrete oficial.',
      tips: [
        'Sube tu Logo (se incluirá en todas las facturas y PDFs).',
        'Ingresa tu RNC / Cédula, teléfono y dirección.',
        'Configura tu tasa de ITBIS (por defecto 18% para R.D.).',
      ],
    },
    {
      title: '2. Registra a tus Clientes',
      icon: <Users className="w-8 h-8 text-purple-400" />,
      description:
        'En la pestaña "Clientes", usa el botón flotante (+) para agregar a tus clientes.',
      tips: [
        'Guarda su nombre, teléfono, RNC/Cédula y correo.',
        'Toca sobre cualquier cliente para ver su Ficha Financiera con su historial de deudas y préstamos.',
      ],
    },
    {
      title: '3. Personaliza tu Catálogo de Servicios',
      icon: <Wrench className="w-8 h-8 text-amber-400" />,
      description:
        'En Ajustes ➔ Catálogo de Servicios, agrega los trabajos que realizas habitualmente.',
      tips: [
        'Clasifica por categorías: Plomería, Electricidad, Pintura u Otros.',
        'Define el precio base por hora, unidad, m² o servicio completo.',
        'Te servirá como atajo rápido al crear cotizaciones.',
      ],
    },
    {
      title: '4. Cotizaciones, Facturas y NCF',
      icon: <FileText className="w-8 h-8 text-emerald-400" />,
      description:
        'En "Documentos", crea cotizaciones con cálculo automático de subtotal e ITBIS.',
      tips: [
        'Convierte cualquier Cotización a Factura con un solo clic (copia cliente e ítems).',
        'Agrega NCF (Número de Comprobante Fiscal) si tu cliente lo requiere.',
        'Registra pagos parciales o totales (efectivo, transferencia, tarjeta).',
      ],
    },
    {
      title: '5. Préstamos con Cálculo de Cuotas en Vivo',
      icon: <Landmark className="w-8 h-8 text-cyan-400" />,
      description:
        'En "Préstamos", concede financiamientos con cálculo de interés fijo automático.',
      tips: [
        'Mira el resumen en vivo mientras escribes el monto y la tasa (%).',
        'Genera el calendario de cuotas (semanal, quincenal o mensual).',
        'Marca los pagos de cuotas uno por uno y controla los atrasos.',
      ],
    },
    {
      title: '6. Descarga PDF y Envía por WhatsApp',
      icon: <Share2 className="w-8 h-8 text-emerald-400" />,
      description:
        'Cualquier documento se puede exportar en PDF o compartir por WhatsApp.',
      tips: [
        'Haz clic en "PDF" para ver la vista previa e imprimir.',
        'Haz clic en "WhatsApp" para abrir un chat con el cliente con el desglose listo.',
      ],
    },
  ];

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Guía de Uso ({currentStep + 1} / {steps.length})
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-center sm:text-left">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto sm:mx-0 shadow-inner">
            {step.icon}
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">{step.title}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{step.description}</p>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-2 text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
              Puntos Clave / Consejos:
            </span>
            <ul className="space-y-1.5">
              {step.tips.map((tip, idx) => (
                <li key={idx} className="flex items-start gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
          <button
            onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
            disabled={currentStep === 0}
            className={`flex items-center gap-1 font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              currentStep === 0
                ? 'opacity-40 cursor-not-allowed text-slate-500'
                : 'text-slate-300 hover:text-white bg-slate-800'
            }`}
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          <div className="flex items-center gap-1">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentStep ? 'w-5 bg-emerald-500' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          {currentStep < steps.length - 1 ? (
            <button
              onClick={() => setCurrentStep((prev) => Math.min(steps.length - 1, prev + 1))}
              className="flex items-center gap-1 font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 px-3.5 py-1.5 rounded-lg shadow-sm transition-colors"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex items-center gap-1 font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded-lg shadow-sm transition-colors"
            >
              ¡Entendido! <Play className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
