/*
# Hotel Housekeeping Management System — Core Schema

## Overview
Creates the complete database schema for a hotel housekeeping management system
with role-based access control (RBAC). The system manages rooms, floors, housekeeping
assignments, inspections, laundry, linen tracking, store requests, loan management,
activity logs, notifications, and spreadsheet sync templates.

## Tables Created

### Master Data
- `profiles` — extends Supabase auth.users with role, full_name, phone, active status
- `floors` — hotel floors (name, code, sort order)
- `room_types` — room categories (name, code, capacity, base price)
- `sections` — housekeeping sections per floor
- `amenities` — hotel amenities inventory (name, code, category, unit)
- `rooms` — hotel rooms (number, floor, type, section, housekeeping status)

### Operations
- `assignments` — housekeeping tasks assigned to staff per room
- `inspections` — room inspection records by supervisors
- `laundry_orders` — laundry order headers
- `laundry_items` — line items within laundry orders
- `linen_inventory` — linen stock levels (in stock, in use, dirty, damaged)
- `linen_movements` — linen stock movement log
- `store_requests` — supply/store requests by staff
- `loans` — equipment/item loans to staff

### System
- `activity_logs` — audit trail of all user actions
- `notifications` — in-app notifications per user
- `spreadsheet_templates` — admin-defined export templates per module

## Security
- RLS enabled on every table.
- All operational data is intentionally shared among authenticated hotel staff,
  so SELECT/INSERT/UPDATE/DELETE policies use `TO authenticated` with `USING (true)`.
- Role-based access control (admin/supervisor/order_taker/housekeeping) is enforced
  in the application layer.
- Profiles: authenticated users can read all profiles; only admin can delete.
- Helper function `is_admin()` checks if the current user has the 'admin' role.

## Notes
1. `profiles.id` references `auth.users(id)` with CASCADE delete.
2. `rooms.housekeeping_status` uses a CHECK constraint for valid statuses.
3. All timestamps default to `now()`.
4. `updated_at` triggers auto-update modified rows.
5. A trigger on `auth.users` auto-creates a profile row when a new user signs up.
*/

-- ============================================================
-- PROFILES (must come first; is_admin depends on it)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'housekeeping'
    CHECK (role IN ('admin', 'supervisor', 'order_taker', 'housekeeping')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- HELPER FUNCTION: is_admin() (after profiles table, before policies that use it)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Now enable RLS and add policies for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_authenticated" ON public.profiles;
CREATE POLICY "profiles_insert_authenticated" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_update_authenticated" ON public.profiles;
CREATE POLICY "profiles_update_authenticated" ON public.profiles FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- FLOORS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "floors_select_authenticated" ON public.floors;
CREATE POLICY "floors_select_authenticated" ON public.floors FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "floors_insert_authenticated" ON public.floors;
CREATE POLICY "floors_insert_authenticated" ON public.floors FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "floors_update_authenticated" ON public.floors;
CREATE POLICY "floors_update_authenticated" ON public.floors FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "floors_delete_authenticated" ON public.floors;
CREATE POLICY "floors_delete_authenticated" ON public.floors FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- ROOM TYPES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  capacity integer NOT NULL DEFAULT 2,
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_types_select_authenticated" ON public.room_types;
CREATE POLICY "room_types_select_authenticated" ON public.room_types FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "room_types_insert_authenticated" ON public.room_types;
CREATE POLICY "room_types_insert_authenticated" ON public.room_types FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "room_types_update_authenticated" ON public.room_types;
CREATE POLICY "room_types_update_authenticated" ON public.room_types FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "room_types_delete_authenticated" ON public.room_types;
CREATE POLICY "room_types_delete_authenticated" ON public.room_types FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- SECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  floor_id uuid REFERENCES public.floors(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sections_select_authenticated" ON public.sections;
CREATE POLICY "sections_select_authenticated" ON public.sections FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "sections_insert_authenticated" ON public.sections;
CREATE POLICY "sections_insert_authenticated" ON public.sections FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sections_update_authenticated" ON public.sections;
CREATE POLICY "sections_update_authenticated" ON public.sections FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sections_delete_authenticated" ON public.sections;
CREATE POLICY "sections_delete_authenticated" ON public.sections FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- AMENITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  category text NOT NULL DEFAULT 'general',
  unit text NOT NULL DEFAULT 'pcs',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.amenities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "amenities_select_authenticated" ON public.amenities;
CREATE POLICY "amenities_select_authenticated" ON public.amenities FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "amenities_insert_authenticated" ON public.amenities;
CREATE POLICY "amenities_insert_authenticated" ON public.amenities FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "amenities_update_authenticated" ON public.amenities;
CREATE POLICY "amenities_update_authenticated" ON public.amenities FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "amenities_delete_authenticated" ON public.amenities;
CREATE POLICY "amenities_delete_authenticated" ON public.amenities FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- ROOMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  floor_id uuid REFERENCES public.floors(id) ON DELETE SET NULL,
  room_type_id uuid REFERENCES public.room_types(id) ON DELETE SET NULL,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  housekeeping_status text NOT NULL DEFAULT 'clean'
    CHECK (housekeeping_status IN ('dirty', 'clean', 'inspected', 'occupied', 'vacant', 'out_of_order')),
  occupancy_status text NOT NULL DEFAULT 'vacant'
    CHECK (occupancy_status IN ('occupied', 'vacant', 'reserved')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  notes text,
  last_cleaned_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rooms_floor ON public.rooms(floor_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(housekeeping_status);
CREATE INDEX IF NOT EXISTS idx_rooms_section ON public.rooms(section_id);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_select_authenticated" ON public.rooms;
CREATE POLICY "rooms_select_authenticated" ON public.rooms FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "rooms_insert_authenticated" ON public.rooms;
CREATE POLICY "rooms_insert_authenticated" ON public.rooms FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rooms_update_authenticated" ON public.rooms;
CREATE POLICY "rooms_update_authenticated" ON public.rooms FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "rooms_delete_authenticated" ON public.rooms;
CREATE POLICY "rooms_delete_authenticated" ON public.rooms FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  task_type text NOT NULL DEFAULT 'cleaning'
    CHECK (task_type IN ('cleaning', 'turndown', 'deep_clean', 'checkout', 'vacant')),
  notes text,
  assigned_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_room ON public.assignments(room_id);
CREATE INDEX IF NOT EXISTS idx_assignments_staff ON public.assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON public.assignments(status);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignments_select_authenticated" ON public.assignments;
CREATE POLICY "assignments_select_authenticated" ON public.assignments FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "assignments_insert_authenticated" ON public.assignments;
CREATE POLICY "assignments_insert_authenticated" ON public.assignments FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "assignments_update_authenticated" ON public.assignments;
CREATE POLICY "assignments_update_authenticated" ON public.assignments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "assignments_delete_authenticated" ON public.assignments;
CREATE POLICY "assignments_delete_authenticated" ON public.assignments FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- INSPECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  inspector_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'passed', 'failed', 'needs_attention')),
  score integer CHECK (score >= 0 AND score <= 100),
  checklist jsonb DEFAULT '{}',
  notes text,
  inspected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspections_room ON public.inspections(room_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON public.inspections(status);

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inspections_select_authenticated" ON public.inspections;
CREATE POLICY "inspections_select_authenticated" ON public.inspections FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "inspections_insert_authenticated" ON public.inspections;
CREATE POLICY "inspections_insert_authenticated" ON public.inspections FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "inspections_update_authenticated" ON public.inspections;
CREATE POLICY "inspections_update_authenticated" ON public.inspections FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "inspections_delete_authenticated" ON public.inspections;
CREATE POLICY "inspections_delete_authenticated" ON public.inspections FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- LAUNDRY ORDERS & ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.laundry_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  guest_name text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'washing', 'drying', 'folding', 'ready', 'delivered', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('express', 'normal')),
  total_items integer NOT NULL DEFAULT 0,
  notes text,
  order_taker_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_laundry_orders_status ON public.laundry_orders(status);
CREATE INDEX IF NOT EXISTS idx_laundry_orders_room ON public.laundry_orders(room_id);

ALTER TABLE public.laundry_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "laundry_orders_select_authenticated" ON public.laundry_orders;
CREATE POLICY "laundry_orders_select_authenticated" ON public.laundry_orders FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "laundry_orders_insert_authenticated" ON public.laundry_orders;
CREATE POLICY "laundry_orders_insert_authenticated" ON public.laundry_orders FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "laundry_orders_update_authenticated" ON public.laundry_orders;
CREATE POLICY "laundry_orders_update_authenticated" ON public.laundry_orders FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "laundry_orders_delete_authenticated" ON public.laundry_orders;
CREATE POLICY "laundry_orders_delete_authenticated" ON public.laundry_orders FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.laundry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  laundry_order_id uuid NOT NULL REFERENCES public.laundry_orders(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  service_type text NOT NULL DEFAULT 'wash'
    CHECK (service_type IN ('wash', 'dry_clean', 'press', 'fold')),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_laundry_items_order ON public.laundry_items(laundry_order_id);

ALTER TABLE public.laundry_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "laundry_items_select_authenticated" ON public.laundry_items;
CREATE POLICY "laundry_items_select_authenticated" ON public.laundry_items FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "laundry_items_insert_authenticated" ON public.laundry_items;
CREATE POLICY "laundry_items_insert_authenticated" ON public.laundry_items FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "laundry_items_update_authenticated" ON public.laundry_items;
CREATE POLICY "laundry_items_update_authenticated" ON public.laundry_items FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "laundry_items_delete_authenticated" ON public.laundry_items;
CREATE POLICY "laundry_items_delete_authenticated" ON public.laundry_items FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- LINEN INVENTORY & MOVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.linen_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  category text NOT NULL DEFAULT 'bed_linen'
    CHECK (category IN ('bed_linen', 'bath_linen', 'table_linen', 'uniform', 'other')),
  quantity_in_stock integer NOT NULL DEFAULT 0,
  quantity_in_use integer NOT NULL DEFAULT 0,
  quantity_dirty integer NOT NULL DEFAULT 0,
  quantity_damaged integer NOT NULL DEFAULT 0,
  par_level integer NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'pcs',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.linen_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "linen_inventory_select_authenticated" ON public.linen_inventory;
CREATE POLICY "linen_inventory_select_authenticated" ON public.linen_inventory FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "linen_inventory_insert_authenticated" ON public.linen_inventory;
CREATE POLICY "linen_inventory_insert_authenticated" ON public.linen_inventory FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "linen_inventory_update_authenticated" ON public.linen_inventory;
CREATE POLICY "linen_inventory_update_authenticated" ON public.linen_inventory FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "linen_inventory_delete_authenticated" ON public.linen_inventory;
CREATE POLICY "linen_inventory_delete_authenticated" ON public.linen_inventory FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.linen_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linen_item_id uuid NOT NULL REFERENCES public.linen_inventory(id) ON DELETE CASCADE,
  movement_type text NOT NULL
    CHECK (movement_type IN ('issue', 'return', 'wash', 'damage', 'adjust', 'discard')),
  quantity integer NOT NULL DEFAULT 0,
  from_location text,
  to_location text,
  notes text,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_linen_movements_item ON public.linen_movements(linen_item_id);

ALTER TABLE public.linen_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "linen_movements_select_authenticated" ON public.linen_movements;
CREATE POLICY "linen_movements_select_authenticated" ON public.linen_movements FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "linen_movements_insert_authenticated" ON public.linen_movements;
CREATE POLICY "linen_movements_insert_authenticated" ON public.linen_movements FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "linen_movements_update_authenticated" ON public.linen_movements;
CREATE POLICY "linen_movements_update_authenticated" ON public.linen_movements FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "linen_movements_delete_authenticated" ON public.linen_movements;
CREATE POLICY "linen_movements_delete_authenticated" ON public.linen_movements FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- STORE REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.store_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  quantity integer NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'pcs',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'fulfilled', 'rejected')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_requests_status ON public.store_requests(status);

ALTER TABLE public.store_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_requests_select_authenticated" ON public.store_requests;
CREATE POLICY "store_requests_select_authenticated" ON public.store_requests FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "store_requests_insert_authenticated" ON public.store_requests;
CREATE POLICY "store_requests_insert_authenticated" ON public.store_requests FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "store_requests_update_authenticated" ON public.store_requests;
CREATE POLICY "store_requests_update_authenticated" ON public.store_requests FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "store_requests_delete_authenticated" ON public.store_requests;
CREATE POLICY "store_requests_delete_authenticated" ON public.store_requests FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- LOANS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_number text NOT NULL UNIQUE,
  staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'returned', 'lost', 'damaged')),
  loaned_at timestamptz DEFAULT now(),
  returned_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_staff ON public.loans(staff_id);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loans_select_authenticated" ON public.loans;
CREATE POLICY "loans_select_authenticated" ON public.loans FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "loans_insert_authenticated" ON public.loans;
CREATE POLICY "loans_insert_authenticated" ON public.loans FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "loans_update_authenticated" ON public.loans;
CREATE POLICY "loans_update_authenticated" ON public.loans FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "loans_delete_authenticated" ON public.loans;
CREATE POLICY "loans_delete_authenticated" ON public.loans FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- ACTIVITY LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select_authenticated" ON public.activity_logs;
CREATE POLICY "activity_logs_select_authenticated" ON public.activity_logs FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "activity_logs_insert_authenticated" ON public.activity_logs;
CREATE POLICY "activity_logs_insert_authenticated" ON public.activity_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'info'
    CHECK (type IN ('info', 'success', 'warning', 'error', 'assignment', 'inspection')),
  read boolean NOT NULL DEFAULT false,
  link text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;
CREATE POLICY "notifications_insert_authenticated" ON public.notifications FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- SPREADSHEET TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.spreadsheet_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  module text NOT NULL,
  format text NOT NULL DEFAULT 'csv'
    CHECK (format IN ('google_sheets', 'excel_online', 'csv', 'xlsx')),
  config jsonb NOT NULL DEFAULT '{}',
  sync_schedule text,
  last_synced_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.spreadsheet_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spreadsheet_templates_select_authenticated" ON public.spreadsheet_templates;
CREATE POLICY "spreadsheet_templates_select_authenticated" ON public.spreadsheet_templates FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "spreadsheet_templates_insert_admin" ON public.spreadsheet_templates;
CREATE POLICY "spreadsheet_templates_insert_admin" ON public.spreadsheet_templates FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "spreadsheet_templates_update_admin" ON public.spreadsheet_templates;
CREATE POLICY "spreadsheet_templates_update_admin" ON public.spreadsheet_templates FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "spreadsheet_templates_delete_admin" ON public.spreadsheet_templates;
CREATE POLICY "spreadsheet_templates_delete_admin" ON public.spreadsheet_templates FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'profiles', 'floors', 'room_types', 'sections', 'amenities', 'rooms',
    'assignments', 'inspections', 'laundry_orders', 'linen_inventory',
    'linen_movements', 'store_requests', 'loans', 'spreadsheet_templates'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()', t);
  END LOOP;
END $$;

-- ============================================================
-- HANDLE NEW USER: auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'housekeeping')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
