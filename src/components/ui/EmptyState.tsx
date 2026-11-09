import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {icon && (
        <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-400 mb-4">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-brand-700">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-brand-400 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
