import React from 'react';
import { Check, ShieldCheck, Sparkles } from 'lucide-react';
import { FREE_PLAN_LIMITS, STORAGE_MB } from '@/core/plans';
import { APP_CONFIG } from '@/core/config';

export const Plans: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-16 space-y-12">
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-xs font-semibold tracking-wider text-terracotta-600 uppercase block mb-1">
          Modelo de Acceso
        </span>
        <h1 className="text-3xl font-extrabold text-brand-900 tracking-tight mb-4">
          Planes transparentes, sin trampas
        </h1>
        <p className="text-sm text-brand-600 leading-relaxed">
          Comenzá de forma 100% gratuita con límites razonables. Crecé cuando lo necesites, sin contratos forzados ni bloqueo de tus datos históricos.
        </p>
      </div>

      {/* Tarjeta Plan Gratuito */}
      <div className="max-w-lg mx-auto bg-white border-2 border-brand-900 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-brand-900">
              {FREE_PLAN_LIMITS.name}
            </h3>
            <p className="text-xs text-brand-500 mt-1">
              Para nuevos usuarios y talleres que inician
            </p>
          </div>
          <span className="text-xs font-bold bg-brand-100 text-brand-800 px-3 py-1 rounded-full uppercase tracking-wider">
            $0 / mes
          </span>
        </div>

        <p className="text-xs text-brand-600 leading-relaxed mb-6 pb-6 border-b border-brand-100">
          {FREE_PLAN_LIMITS.description}
        </p>

        <ul className="space-y-3 mb-8 text-xs text-brand-700">
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Organizaciones</span>
            </span>
            <strong className="text-brand-900">{FREE_PLAN_LIMITS.maxOrganizations} espacio</strong>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Administradores y profesionales</span>
            </span>
            <strong className="text-brand-900">Hasta {FREE_PLAN_LIMITS.maxStaff}</strong>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Clientes y alumnos activos</span>
            </span>
            <strong className="text-brand-900">Hasta {FREE_PLAN_LIMITS.maxActiveContacts}</strong>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Reservas confirmadas o realizadas</span>
            </span>
            <strong className="text-brand-900">{FREE_PLAN_LIMITS.maxMonthlyBookings} por mes</strong>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Actividades activas</span>
            </span>
            <strong className="text-brand-900">Hasta {FREE_PLAN_LIMITS.maxActiveActivities}</strong>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Correos transaccionales</span>
            </span>
            <strong className="text-brand-900">{FREE_PLAN_LIMITS.maxMonthlyEmails} por mes</strong>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Almacenamiento</span>
            </span>
            <strong className="text-brand-900">{STORAGE_MB(FREE_PLAN_LIMITS.maxStorageBytes)} MB</strong>
          </li>
        </ul>

        <div className="pt-4 border-t border-brand-100 text-center">
          <span className="text-[11px] text-brand-500 block">
            Cuotas gestionadas y validadas directamente en el backend de TURNAR.
          </span>
        </div>
      </div>

      {/* Regla de Oro sobre Límites */}
      <div className="bg-white border border-brand-200 rounded-xl p-6 sm:p-8 space-y-3">
        <div className="flex items-center gap-2 text-brand-900 font-semibold text-sm">
          <ShieldCheck className="w-4 h-4 text-terracotta-600" />
          <span>¿Qué sucede cuando se alcanza un límite mensual?</span>
        </div>
        <p className="text-xs text-brand-600 leading-relaxed">
          El comportamiento es 100% transparente: se te informará con claridad en pantalla cuándo se renueva el período. <strong>Nunca</strong> borraremos tus alumnos, ni ocultaremos tu historial, ni desactivaremos tu acceso, ni impediremos que exportes tus datos. Las restricciones se aplican exclusivamente a nuevas reservas u operaciones que excedan la cuota hasta el próximo ciclo.
        </p>
      </div>

      {/* Opción personalizada */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-emerald-950 mb-1">
            ¿Tu proyecto necesita límites especiales o funciones dedicadas?
          </h4>
          <p className="text-xs text-emerald-800 leading-relaxed">
            Podemos diseñar un esquema a la medida de tu academia, taller o espacio.
          </p>
        </div>
        <a
          href={APP_CONFIG.customDevWhatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100/50 px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>Consultar por WhatsApp</span>
        </a>
      </div>
    </div>
  );
};
