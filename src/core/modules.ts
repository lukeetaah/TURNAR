export type ModuleKey =
  | 'agenda'
  | 'bookings'
  | 'clients'
  | 'instructors'
  | 'activities'
  | 'payments'
  | 'communications'
  | 'announcements'
  | 'events'
  | 'community';

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  description: string;
  isCore: boolean;
  dependencies: ModuleKey[];
  futurePhase?: boolean;
}

export const MODULE_REGISTRY: Record<ModuleKey, ModuleDefinition> = {
  activities: {
    key: 'activities',
    name: 'Actividades y Clases',
    description: 'Gestión de clases recurrentes, talleres, precios y cupos.',
    isCore: true,
    dependencies: [],
  },
  instructors: {
    key: 'instructors',
    name: 'Profesionales',
    description: 'Gestión de profesores, docentes y miembros del equipo.',
    isCore: true,
    dependencies: [],
  },
  agenda: {
    key: 'agenda',
    name: 'Agenda',
    description: 'Disponibilidad horaria, calendario de sesiones y excepciones.',
    isCore: true,
    dependencies: ['activities'],
  },
  bookings: {
    key: 'bookings',
    name: 'Reservas',
    description: 'Gestión de cupos, cancelaciones con reglas y listas de espera.',
    isCore: false,
    dependencies: ['agenda'],
  },
  clients: {
    key: 'clients',
    name: 'Alumnos y Clientes',
    description: 'Padrón de personas, asistencias, historial y vinculación con adultos responsables.',
    isCore: true,
    dependencies: [],
  },
  payments: {
    key: 'payments',
    name: 'Pagos y Cuotas',
    description: 'Control manual de cuotas mensuales, métodos de pago e historial.',
    isCore: false,
    dependencies: ['clients'],
  },
  communications: {
    key: 'communications',
    name: 'Comunicaciones',
    description: 'Plantillas y notificaciones transaccionales por email.',
    isCore: false,
    dependencies: [],
  },
  announcements: {
    key: 'announcements',
    name: 'Noticias',
    description: 'Avisos y novedades visibles para alumnos y clientes.',
    isCore: false,
    dependencies: [],
  },
  events: {
    key: 'events',
    name: 'Eventos',
    description: 'Encuentros especiales, muestras y actividades de fecha única.',
    isCore: false,
    dependencies: [],
  },
  community: {
    key: 'community',
    name: 'Comunidad',
    description: 'Espacio de interacción entre participantes (Fase futura).',
    isCore: false,
    dependencies: ['clients'],
    futurePhase: true,
  },
};
