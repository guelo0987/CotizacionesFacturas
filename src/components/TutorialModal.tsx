import React from 'react';
import { Joyride, STATUS } from 'react-joyride';
import type { Step } from 'react-joyride';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const steps: Step[] = [
    {
      target: 'body',
      content: '¡Bienvenido a tu Sistema de Gestión! Esta guía interactiva te mostrará dónde están las cosas importantes. Dale a Siguiente.',
      placement: 'center',
    },
    {
      target: '.tour-dashboard-hero',
      content: 'Este es tu Panel Operativo. Aquí verás el resumen de todo el dinero por cobrar, cotizaciones activas y préstamos vigentes.',
      placement: 'bottom',
    },
    {
      target: '.tour-nav-clientes',
      content: 'En la sección de Clientes puedes agregar personas y ver su ficha con su historial de deudas y préstamos.',
      placement: 'top',
    },
    {
      target: '.tour-nav-documentos',
      content: 'Aquí creas Cotizaciones y Facturas. Puedes agregar ítems, calcular ITBIS, añadir NCF y registrar pagos parciales en vivo.',
      placement: 'top',
    },
    {
      target: '.tour-nav-prestamos',
      content: 'La sección de Préstamos te permite calcular cuotas de financiamiento automáticamente con tasa fija.',
      placement: 'top',
    },
    {
      target: '.tour-ajustes',
      content: '¡No olvides ir a Ajustes (⚙️) para poner el logo de tu negocio, tu RNC y crear tus servicios predefinidos!',
      placement: 'bottom',
    }
  ];

  const handleJoyrideCallback = (data: any) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    
    if (finishedStatuses.includes(status)) {
      onClose();
    }
  };

  // We handle the case where Joyride might need to be imported differently depending on TS config
  const JoyrideComponent = (Joyride as any).default || Joyride;

  return (
    <JoyrideComponent
      steps={steps}
      run={isOpen}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      disableOverlayClose={true}
      spotlightClicks={true}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#059669', // emerald-600
          textColor: '#1e293b', // slate-800
          backgroundColor: '#ffffff',
          overlayColor: 'rgba(0, 0, 0, 0.65)',
        },
        tooltipContainer: {
          textAlign: 'left',
          fontSize: '14px',
          fontFamily: 'Inter, sans-serif'
        },
        buttonNext: {
          backgroundColor: '#059669',
          borderRadius: '8px',
          fontWeight: 'bold',
          padding: '8px 16px',
        },
        buttonBack: {
          marginRight: 10,
          color: '#64748b'
        },
        buttonSkip: {
          color: '#94a3b8'
        }
      }}
      locale={{
        back: 'Anterior',
        close: 'Cerrar',
        last: '¡Entendido!',
        next: 'Siguiente',
        skip: 'Omitir tour'
      }}
    />
  );
};
