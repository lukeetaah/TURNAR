import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const NotFound: React.FC = () => {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <h1 className="text-4xl font-extrabold text-brand-900 mb-2">404</h1>
      <p className="text-sm text-brand-600 mb-6">
        La página que buscás no existe o ha cambiado de lugar.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-brand-900 text-white hover:bg-brand-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Volver al inicio</span>
      </Link>
    </div>
  );
};
