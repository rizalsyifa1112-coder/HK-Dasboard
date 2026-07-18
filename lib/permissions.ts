import type { UserRole } from '@/lib/types';

export type ModuleKey =
  | 'dashboard'
  | 'room-status'
  | 'assignments'
  | 'inspection'
  | 'laundry'
  | 'general-laundry'
  | 'linen-tracking'
  | 'linen-general'
  | 'store-request'
  | 'loan-management'
  | 'reports'
  | 'activity-logs'
  | 'rooms'
  | 'floors'
  | 'room-types'
  | 'sections'
  | 'amenities'
  | 'users'
  | 'ai-vision'
  | 'spreadsheet-templates';

const ROLE_MODULES: Record<UserRole, ModuleKey[]> = {
  admin: [
    'dashboard', 'room-status', 'assignments', 'inspection', 'laundry',
    'general-laundry', 'linen-tracking', 'linen-general', 'store-request',
    'loan-management', 'reports', 'activity-logs', 'rooms', 'floors',
    'room-types', 'sections', 'amenities', 'users', 'ai-vision',
    'spreadsheet-templates',
  ],
  supervisor: [
    'dashboard', 'room-status', 'assignments', 'inspection', 'laundry',
    'general-laundry', 'linen-tracking', 'linen-general', 'store-request',
    'loan-management', 'reports', 'activity-logs', 'rooms', 'floors',
    'room-types', 'sections', 'amenities', 'ai-vision', 'spreadsheet-templates',
  ],
  order_taker: [
    'dashboard', 'laundry', 'general-laundry', 'linen-general',
    'loan-management', 'linen-tracking',
  ],
  housekeeping: [
    'dashboard', 'assignments',
  ],
  evening_shift: [
    'loan-management',
  ],
};

export function canAccess(role: UserRole | undefined | null, module: ModuleKey): boolean {
  if (!role) return false;
  return ROLE_MODULES[role]?.includes(module) ?? false;
}

export function canManageUsers(role: UserRole | undefined | null): boolean {
  return role === 'admin';
}

export function canManageMasterData(role: UserRole | undefined | null): boolean {
  return role === 'admin' || role === 'supervisor';
}

export function canApproveAI(role: UserRole | undefined | null): boolean {
  return role === 'admin' || role === 'supervisor';
}

export function getAccessibleModules(role: UserRole): ModuleKey[] {
  return ROLE_MODULES[role] ?? [];
}
