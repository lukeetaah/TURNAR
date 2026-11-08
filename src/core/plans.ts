export interface PlanLimits {
  code: string;
  name: string;
  description: string;
  maxOrganizations: number;
  maxStaff: number;
  maxActiveContacts: number;
  maxMonthlyBookings: number;
  maxActiveActivities: number;
  maxMonthlyEmails: number;
  maxStorageBytes: number;
}

export const FREE_PLAN_LIMITS: PlanLimits = {
  code: 'free',
  name: 'Plan Gratuito',
  description: 'Para personas, profesores particulares y pequeños talleres que comienzan.',
  maxOrganizations: 1,
  maxStaff: 2,
  maxActiveContacts: 100,
  maxMonthlyBookings: 200,
  maxActiveActivities: 5,
  maxMonthlyEmails: 250,
  maxStorageBytes: 250 * 1024 * 1024, // 250 MB
};

export const STORAGE_MB = (bytes: number): number => {
  return Math.round(bytes / (1024 * 1024));
};
