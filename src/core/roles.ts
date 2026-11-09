export type OrganizationRole = 'owner' | 'admin' | 'instructor' | 'client';

export const formatRole = (role?: string | null): string => {
  if (!role) return 'Sin rol';
  switch (role.toLowerCase()) {
    case 'owner':
      return 'Dueño';
    case 'admin':
      return 'Administrador';
    case 'instructor':
      return 'Profesor';
    case 'client':
      return 'Alumno';
    default:
      return role;
  }
};
