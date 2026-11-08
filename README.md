# TURNAR
## Plataforma modular de gestión para personas, profesionales, talleres y emprendimientos.
### Una creación de LUKSONARTS.

Repositorio oficial: [https://github.com/lukeetaah/TURNAR](https://github.com/lukeetaah/TURNAR)

---

## 1. Identidad y Filosofía

TURNAR es una plataforma web de gestión modular creada para simplificar la administración de personas, profesionales, talleres de cerámica, academias de música, estudios de yoga, profesores particulares y pequeños emprendimientos.

### Regla Principal: Simplicidad Extrema
**TURNAR se adapta a la actividad de cada persona. La persona no tiene que aprender a utilizar un sistema complejo.**
- Sin paneles sobrecargados ni botones innecesarios.
- Responsive con prioridad **mobile-first**.
- Español argentino como idioma inicial.
- Modelo transparente: Plan Gratuito con límites razonables que protegen la infraestructura, sin bloquear funcionalidades esenciales ni destruir información histórica.

---

## 2. Tecnologías

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, React Router v7.
- **Backend:** Supabase (PostgreSQL, Supabase Auth con OAuth/Magic Links, Storage y Edge Functions).
- **Aislamiento Multi-Tenant:** Row Level Security (RLS) estricto en PostgreSQL.

---

## 3. Estructura del Proyecto

```text
TURNAR/
├── public/                 # Favicon y activos públicos
├── src/
│   ├── components/         # Componentes UI reutilizables
│   │   └── layout/         # Header, Footer institucional y Layout principal
│   ├── core/               # Núcleo del sistema, configuración, módulos y límites de planes
│   │   ├── config.ts       # Enlaces oficiales de LUKSONARTS, WhatsApp y textos institucionales
│   │   ├── modules.ts      # Registro y dependencias de módulos de TURNAR
│   │   └── plans.ts        # Definición de cuotas y límites de planes
│   ├── lib/                # Utilidades y clientes
│   │   ├── supabase/       # Cliente seguro y types de base de datos
│   │   │   ├── client.ts   # Instancia desacoplada y defensiva de Supabase
│   │   │   └── types.ts    # Tipos TypeScript para el esquema de la base de datos
│   │   └── utils.ts        # Helper de clases Tailwind (clsx + tailwind-merge)
│   ├── modules/            # Módulos funcionales de TURNAR (en preparación)
│   ├── pages/              # Vistas principales (Home, About, Plans, Login, NotFound)
│   ├── App.tsx             # Enrutamiento principal de la aplicación
│   ├── index.css           # Estilos globales y capas de Tailwind
│   └── main.tsx            # Punto de entrada de la aplicación
├── supabase/
│   └── migrations/         # Migraciones SQL versionadas y documentadas
├── .env.example            # Variables de entorno requeridas
├── index.html              # HTML base
├── package.json            # Dependencias del proyecto
├── postcss.config.js       # Configuración de PostCSS
├── tailwind.config.js      # Configuración de diseño y paleta TURNAR
├── tsconfig.json           # Configuración base de TypeScript
├── tsconfig.app.json       # Configuración de TypeScript para la app
├── tsconfig.node.json      # Configuración de TypeScript para herramientas Node
└── vite.config.ts          # Configuración de Vite con alias '@/...'
```

---

## 4. Instalación y Ejecución Local

### Prerrequisitos
- **Node.js:** v18 o superior (v24.13.0 recomendado).
- **npm:** v10 o superior (v11.6.2 recomendado).

### Pasos

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/lukeetaah/TURNAR.git
   cd TURNAR
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno:
   ```bash
   cp .env.example .env.local
   ```
   *(Nota: En la Fase 1, la aplicación funciona en modo desacoplado sin requerir credenciales de Supabase activas).*

4. Ejecutar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   Acceder a `http://localhost:5173`.

5. Comprobar tipos y compilar para producción:
   ```bash
   npm run build
   ```

---

## 5. Esquema de Migraciones SQL

Las migraciones se encuentran en `supabase/migrations/` listas para su revisión y aplicación en el proyecto independiente de Supabase:

1. `20261108000001_core_schema.sql`:
   - Tablas `profiles`, `organizations`, `organization_members`, `organization_settings` y `organization_modules`.
   - Funciones SQL de seguridad (`is_platform_admin`, `has_org_role`, `is_org_member`).
2. `20261108000002_plans_and_usage.sql`:
   - Catálogo de `plans` con sembrado oficial del Plan Gratuito (200 reservas/mes, 100 alumnos, 5 actividades, etc.).
   - `organization_subscriptions`, `usage_periods` y `usage_counters` para control de consumo mensual en backend.
3. `20261108000003_activities_and_instructors.sql`:
   - Catálogo de `activities` (duración configurable, adultos/niños), `instructors`, `instructor_availability`, `availability_exceptions`, `activity_schedules` y `activity_sessions`.
4. `20261108000004_contacts_and_bookings.sql`:
   - `contacts`, `guardians` (adulto responsable para menores sin obligar a crear cuentas a niños), `bookings` (estados transaccionales), `waitlists` y `attendance`.
   - Procedimiento atómico `create_booking_atomic` con bloqueo `FOR UPDATE` para evitar sobreventa y validar cuotas mensuales.
5. `20261108000005_payments_and_communications.sql`:
   - `price_versions` (historial inmutable de importes), `payments` manuales, `announcements`, `events`, `notification_outbox` (cola transaccional para Edge Functions) y `audit_logs`.
6. `20261108000006_rls_policies.sql`:
   - Políticas RLS completas garantizando aislamiento estricto multi-tenant y protección de datos privados.
7. `20261108000007_lava_ceramica_setup.sql`:
   - Inicialización controlada de la organización de referencia **LAVA CERÁMICA** (`lava-ceramica`) y tabla `organization_invitations` para invitar a sus administradores de forma segura sin crear identidades ficticias.

---

## 6. Enlaces Oficiales y Soporte

- **Desarrollo a medida:** [Conversar por WhatsApp con LUKSONARTS](https://wa.me/5491178202409)
- **Apoyo voluntario:** [Apoyar a LUKSONARTS](https://shorturl.at/QKwDp)
