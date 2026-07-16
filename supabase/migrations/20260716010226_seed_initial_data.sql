/*
# Seed Initial Master Data

## Overview
Populates floors, room types, sections, amenities, and sample rooms
so the application has data to display on first run.

## Data Inserted
- 5 Floors (Ground, 1st-4th Floor)
- 5 Room Types (Standard, Deluxe, Suite, Executive, Presidential)
- 4 Sections (Wing A-D)
- 8 Amenities (shampoo, soap, towel, bathrobe, slippers, water, coffee, tea)
- 30 Sample Rooms (101-105 ... 401-405) with varied statuses

## Notes
1. Uses ON CONFLICT DO NOTHING for idempotency.
2. Room statuses are varied to make the dashboard look realistic.
3. This is safe to re-run.
*/

-- Floors
INSERT INTO public.floors (name, code, sort_order) VALUES
  ('Ground Floor', 'GF', 0),
  ('1st Floor', '1F', 1),
  ('2nd Floor', '2F', 2),
  ('3rd Floor', '3F', 3),
  ('4th Floor', '4F', 4)
ON CONFLICT (code) DO NOTHING;

-- Room Types
INSERT INTO public.room_types (name, code, description, capacity, base_price) VALUES
  ('Standard Room', 'STD', 'Comfortable room with essential amenities', 2, 120.00),
  ('Deluxe Room', 'DLX', 'Spacious room with premium amenities', 2, 180.00),
  ('Executive Suite', 'EXE', 'Luxury suite with living area', 3, 320.00),
  ('Presidential Suite', 'PRE', 'Top-tier luxury suite', 4, 650.00),
  ('Family Room', 'FAM', 'Large room for families', 4, 220.00)
ON CONFLICT (code) DO NOTHING;

-- Sections
INSERT INTO public.sections (name, code, floor_id) VALUES
  ('Wing A', 'WING-A', (SELECT id FROM public.floors WHERE code = 'GF')),
  ('Wing B', 'WING-B', (SELECT id FROM public.floors WHERE code = '1F')),
  ('Wing C', 'WING-C', (SELECT id FROM public.floors WHERE code = '2F')),
  ('Wing D', 'WING-D', (SELECT id FROM public.floors WHERE code = '3F'))
ON CONFLICT (code) DO NOTHING;

-- Amenities
INSERT INTO public.amenities (name, code, category, unit) VALUES
  ('Shampoo', 'SHAMP', 'bathroom', 'pcs'),
  ('Body Soap', 'SOAP', 'bathroom', 'pcs'),
  ('Bath Towel', 'TOWEL', 'bathroom', 'pcs'),
  ('Bathrobe', 'ROBE', 'bathroom', 'pcs'),
  ('Slippers', 'SLIP', 'bedroom', 'pair'),
  ('Mineral Water', 'WATER', 'beverage', 'bottle'),
  ('Coffee Sachet', 'COFFEE', 'beverage', 'pcs'),
  ('Tea Bag', 'TEA', 'beverage', 'pcs')
ON CONFLICT (code) DO NOTHING;

-- Sample Rooms (30 rooms across floors)
-- Using a DO block to generate rooms programmatically
DO $$
DECLARE
  f RECORD;
  rt RECORD;
  room_num text;
  floor_num integer;
  hk_status text;
  occ_status text;
  prio text;
  rt_codes text[] := ARRAY['STD', 'DLX', 'EXE', 'FAM', 'STD'];
  status_cycle text[] := ARRAY['dirty', 'clean', 'inspected', 'occupied', 'vacant', 'dirty', 'clean', 'out_of_order', 'vacant', 'occupied'];
  occ_cycle text[] := ARRAY['occupied', 'vacant', 'vacant', 'occupied', 'vacant', 'occupied', 'vacant', 'reserved', 'vacant', 'occupied'];
  prio_cycle text[] := ARRAY['normal', 'normal', 'high', 'normal', 'low', 'urgent', 'normal', 'normal', 'high', 'normal'];
  idx integer := 0;
BEGIN
  FOR f IN SELECT * FROM public.floors ORDER BY sort_order LOOP
    floor_num := f.sort_order;
    FOR i IN 1..6 LOOP
      idx := idx + 1;
      room_num := CASE
        WHEN floor_num = 0 THEN '0' || i::text
        ELSE floor_num::text || lpad(i::text, 2, '0')
      END;

      -- Skip if room already exists
      IF EXISTS (SELECT 1 FROM public.rooms WHERE number = room_num) THEN
        CONTINUE;
      END IF;

      hk_status := status_cycle[((idx - 1) % array_length(status_cycle, 1)) + 1];
      occ_status := occ_cycle[((idx - 1) % array_length(occ_cycle, 1)) + 1];
      prio := prio_cycle[((idx - 1) % array_length(prio_cycle, 1)) + 1];

      -- Adjust occupancy to match housekeeping status
      IF hk_status = 'occupied' THEN
        occ_status := 'occupied';
      ELSIF hk_status = 'vacant' THEN
        occ_status := 'vacant';
      ELSIF hk_status = 'out_of_order' THEN
        occ_status := 'vacant';
      END IF;

      SELECT * INTO rt FROM public.room_types WHERE code = rt_codes[((i - 1) % array_length(rt_codes, 1)) + 1];

      INSERT INTO public.rooms (
        number, floor_id, room_type_id, housekeeping_status, occupancy_status, priority, last_cleaned_at
      ) VALUES (
        room_num,
        f.id,
        rt.id,
        hk_status,
        occ_status,
        prio,
        CASE WHEN hk_status IN ('clean', 'inspected') THEN now() - interval '2 hours' ELSE NULL END
      );
    END LOOP;
  END LOOP;
END $$;

-- Seed some linen inventory
INSERT INTO public.linen_inventory (item_name, category, quantity_in_stock, quantity_in_use, quantity_dirty, par_level, unit) VALUES
  ('King Bed Sheet', 'bed_linen', 120, 80, 25, 150, 'pcs'),
  ('Queen Bed Sheet', 'bed_linen', 100, 60, 15, 120, 'pcs'),
  ('Pillow Case', 'bed_linen', 300, 180, 40, 350, 'pcs'),
  ('Bath Towel', 'bath_linen', 250, 150, 50, 300, 'pcs'),
  ('Hand Towel', 'bath_linen', 200, 120, 30, 250, 'pcs'),
  ('Bath Mat', 'bath_linen', 80, 50, 10, 100, 'pcs'),
  ('Table Cloth', 'table_linen', 40, 20, 5, 50, 'pcs'),
  ('Staff Uniform', 'uniform', 60, 40, 8, 70, 'pcs')
ON CONFLICT DO NOTHING;
