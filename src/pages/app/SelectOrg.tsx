import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizations } from '@/hooks/useOrganizations';
import { Button } from '@/components/ui/Button';

export const SelectOrg: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { orgs, loading } = useOrganizations();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <span className="w-6 h-6 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-50 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-900 text-terracotta-400 font-bold text-lg flex items-center justify-center mx-auto mb-3">
            T
          </div>
          <h1 className="text-lg font-bold text-brand-900">
            Hola, {profile?.first_name || 'bienvenido/a'} 👋
          </h1>
          <p className="text-xs text-brand-500 mt-1">
            Seleccioná una organización para continuar
          </p>
        </div>

        {orgs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-brand-200 p-6 text-center">
            <Building2 className="w-8 h-8 text-brand-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-brand-700 mb-1">
              No tenés organizaciones
            </p>
            <p className="text-xs text-brand-400 mb-4">
              Creá tu primer espacio de trabajo para empezar
            </p>
            <Button
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => navigate('/app/create-org')}
            >
              Crear organización
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {orgs.map((org) => (
              <button
                key={org.id}
                onClick={() => navigate(`/app/${org.slug}/dashboard`)}
                className="w-full flex items-center gap-3 p-4 bg-white rounded-xl border border-brand-200 hover:border-brand-400 hover:shadow-sm transition-all group text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-brand-900 flex items-center justify-center text-terracotta-400 font-bold text-sm shrink-0">
                  {org.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-900 truncate">
                    {org.name}
                  </p>
                  <p className="text-xs text-brand-400 capitalize">{org.role}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-brand-300 group-hover:text-brand-600 transition-colors" />
              </button>
            ))}
            <button
              onClick={() => navigate('/app/create-org')}
              className="w-full flex items-center gap-2 justify-center p-3 rounded-xl border border-dashed border-brand-300 text-xs text-brand-400 hover:text-brand-700 hover:border-brand-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Crear nueva organización
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
