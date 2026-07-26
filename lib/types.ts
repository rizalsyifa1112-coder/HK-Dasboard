export type UserRole = 'admin' | 'supervisor' | 'order_taker' | 'housekeeping' | 'evening_shift';

export type HousekeepingStatus =
  | 'vacant_dirty'
  | 'vacant_clean_unchecked'
  | 'vacant_clean'
  | 'vacant_clean_inspected'
  | 'occupied_clean'
  | 'occupied_dirty'
  | 'expected_departure'
  | 'out_of_order'
  | 'off_market';

export type OccupancyStatus = 'occupied' | 'vacant' | 'reserved';

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Building {
  id: string;
  name: string;
  code: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Floor {
  id: string;
  name: string;
  code: string;
  description: string | null;
  building_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  building?: Building | null;
}

export interface RoomType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  capacity: number;
  base_price: number;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  name: string;
  code: string;
  description: string | null;
  floor_id: string | null;
  floor?: Floor | null;
  created_at: string;
  updated_at: string;
}

export interface Amenity {
  id: string;
  name: string;
  code: string;
  description: string | null;
  category: string;
  unit: string;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  number: string;
  floor_id: string | null;
  room_type_id: string | null;
  section_id: string | null;
  housekeeping_status: HousekeepingStatus;
  occupancy_status: OccupancyStatus;
  priority: Priority;
  notes: string | null;
  notes_set_at: string | null;
  last_cleaned_at: string | null;
  created_at: string;
  updated_at: string;
  floor?: Floor | null;
  room_type?: RoomType | null;
  section?: Section | null;
}

export interface Assignment {
  id: string;
  room_id: string;
  staff_id: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: Priority;
  task_type: 'cleaning' | 'turndown' | 'deep_clean' | 'checkout' | 'vacant';
  notes: string | null;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  fo_status: string | null;
  hk_status_in: string | null;
  hk_status_final: string | null;
  created_at: string;
  updated_at: string;
  room?: Room | null;
  staff?: Profile | null;
}

export interface Inspection {
  id: string;
  room_id: string;
  inspector_id: string | null;
  status: 'pending' | 'passed' | 'failed' | 'needs_attention';
  score: number | null;
  checklist: Record<string, boolean>;
  notes: string | null;
  inspected_at: string | null;
  created_at: string;
  updated_at: string;
  room?: Room | null;
  inspector?: Profile | null;
}

export interface LaundryOrder {
  id: string;
  order_number: string;
  room_id: string | null;
  guest_name: string | null;
  status: 'received' | 'washing' | 'drying' | 'folding' | 'ready' | 'delivered' | 'cancelled';
  priority: 'express' | 'normal';
  total_items: number;
  notes: string | null;
  order_taker_id: string | null;
  created_at: string;
  updated_at: string;
  room?: Room | null;
  order_taker?: Profile | null;
}

export interface LaundryItem {
  id: string;
  laundry_order_id: string;
  item_type: string;
  quantity: number;
  service_type: 'wash' | 'dry_clean' | 'press' | 'fold';
  notes: string | null;
  created_at: string;
}

export interface LinenInventory {
  id: string;
  item_name: string;
  category: 'bed_linen' | 'bath_linen' | 'table_linen' | 'uniform' | 'other';
  quantity_in_stock: number;
  quantity_in_use: number;
  quantity_dirty: number;
  quantity_damaged: number;
  par_level: number;
  unit: string;
  created_at: string;
  updated_at: string;
}

export interface LinenMovement {
  id: string;
  linen_item_id: string;
  movement_type: 'issue' | 'return' | 'wash' | 'damage' | 'adjust' | 'discard';
  quantity: number;
  from_location: string | null;
  to_location: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  linen_item?: LinenInventory | null;
}

export interface StoreRequest {
  id: string;
  request_number: string;
  requested_by: string | null;
  item_id: string | null;
  item_name: string;
  category: string;
  quantity: number;
  unit: string;
  price: number | null;
  status: 'pending' | 'approved' | 'fulfilled' | 'rejected';
  priority: Priority;
  notes: string | null;
  synced_at: string | null;
  request_date: string;
  created_at: string;
  updated_at: string;
  requester?: Profile | null;
  item?: StoreRequestItem | null;
}

export interface StoreRequestItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  sheet_row: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Loan {
  id: string;
  loan_number: string;
  staff_id: string | null;
  loan_item_id: string | null;
  room_id: string | null;
  item_name: string;
  quantity: number;
  status: 'active' | 'returned' | 'lost' | 'damaged';
  loaned_at: string;
  returned_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  staff?: Profile | null;
  loan_item?: LoanItem | null;
  room?: Room | null;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: 'info' | 'success' | 'warning' | 'error' | 'assignment' | 'inspection';
  read: boolean;
  link: string | null;
  created_at: string;
}

export interface SpreadsheetTemplate {
  id: string;
  name: string;
  module: string;
  format: 'google_sheets' | 'excel_online' | 'csv' | 'xlsx';
  config: {
    columns?: string[];
    column_names?: Record<string, string>;
    hidden_columns?: string[];
    formulas?: Record<string, string>;
    sheets?: string[];
  };
  sync_schedule: string | null;
  last_synced_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentAmenityUsage {
  id: string;
  assignment_id: string;
  amenity_id: string;
  quantity: number;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
  amenity?: Amenity | null;
}

export interface AssignmentLinenUsage {
  id: string;
  assignment_id: string;
  linen_item_id: string;
  quantity: number;
  quantity_in: number;
  quantity_out: number;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
  linen_item?: LinenInventory | null;
}

/* ===== Tambahan baru ===== */

export interface LinenItem {
  id: string;
  code: string;
  item_type: 'BT' | 'BM';
  status: 'available' | 'sent_to_laundry' | 'returned' | 'lost';
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneralLaundryItem {
  id: string;
  name: string;
  code: string;
  unit: string;
  category: 'room' | 'fnb';
  default_price: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeneralLaundryRecord {
  id: string;
  record_number: string;
  send_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: GeneralLaundryRecordItem[];
  created_by_profile?: Profile | null;
}

export interface GeneralLaundryRecordItem {
  id: string;
  record_id: string;
  laundry_item_id: string;
  qty_sent: number;
  qty_returned: number;
  price_per_item: number;
  created_at: string;
  updated_at: string;
  laundry_item?: GeneralLaundryItem | null;
}

export interface LoanItem {
  id: string;
  name: string;
  code: string;
  stock: number;
  unit: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/* ===== Label & warna (dari code lama) ===== */

export const HOUSEKEEPING_STATUS_LABELS: Record<HousekeepingStatus, string> = {
  vacant_dirty: 'Vacant Dirty',
  vacant_clean_unchecked: 'Vacant Clean Uncheck',
  vacant_clean: 'Vacant Clean',
  vacant_clean_inspected: 'Vacant Clean Inspected',
  occupied_clean: 'Occupied Clean',
  occupied_dirty: 'Occupied Dirty',
  expected_departure: 'Expected Departure',
  out_of_order: 'Out Of Order',
  off_market: 'Off Market',
};

// ⬅️ DIUBAH: warna "Vacant Clean Uncheck" dan "Expected Departure" dibuat lebih
// pekat/kontras (opacity & saturasi dinaikkan + font-semibold) supaya jelas
// beda dan tidak kelihatan mirip pudar di tema gelap. Status lain tidak disentuh.
export const HOUSEKEEPING_STATUS_COLORS: Record<HousekeepingStatus, string> = {
  vacant_dirty: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  vacant_clean_unchecked: 'bg-orange-500/25 text-orange-700 dark:text-orange-300 border-orange-500/50 font-semibold',
  vacant_clean: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  vacant_clean_inspected: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  occupied_clean: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
  occupied_dirty: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  expected_departure: 'bg-violet-500/25 text-violet-700 dark:text-violet-300 border-violet-500/50 font-semibold',
  out_of_order: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30',
  off_market: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
  normal: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  high: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  urgent: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  supervisor: 'Supervisor',
  order_taker: 'Order Taker',
  housekeeping: 'Housekeeping Staff',
  evening_shift: 'Evening Shift',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  supervisor: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  order_taker: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  housekeeping: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  evening_shift: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
};
