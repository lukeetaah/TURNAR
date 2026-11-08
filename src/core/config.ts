/**
 * TURNAR - Configuración central de la plataforma
 * Creado por LUKSONARTS
 */

export const APP_CONFIG = {
  name: 'TURNAR',
  tagline: 'Plataforma modular de gestión para personas, profesionales, talleres y emprendimientos.',
  creator: 'LUKSONARTS',
  repositoryUrl: 'https://github.com/lukeetaah/TURNAR',
  
  // Canales oficiales de LUKSONARTS
  supportUrl: import.meta.env.VITE_LUKSONARTS_SUPPORT_URL || 'https://shorturl.at/QKwDp',
  customDevWhatsAppUrl: import.meta.env.VITE_LUKSONARTS_WHATSAPP_URL || 'https://wa.me/5491178202409',
  
  // Textos oficiales requeridos
  customDev: {
    title: '¿Necesitás algo más específico para tu proyecto?',
    description: 'TURNAR se adapta a distintas actividades. Si necesitás una experiencia personalizada, nuevas funcionalidades o una solución pensada para tu negocio, podemos conversarlo directamente.',
    buttonText: 'Hablemos por WhatsApp',
  },
  voluntarySupport: {
    title: '¿Te sirve TURNAR? Ayudanos a seguir creando.',
    buttonText: 'Apoyar a LUKSONARTS',
  },
};
