'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { CrudTable, type Column, type FieldDef } from '@/components/crud-table';
import { canManageMasterData } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import {
  HOUSEKEEPING_STATUS_LABELS, HOUSEKEEPING_STATUS_COLORS,
  type Room, type Floor, type RoomType, type Section, type HousekeepingStatus,
} from '@/lib/types';

export default function RoomsPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [roomsRes, floorRes, typeRes, secRes] = await Promise.all([
      supabase.from('rooms').select('*, floor:floors(*), room_type:room_types(*), section:sections(*)').order('number'),
      supabase.from('floors').select('*').order('sort_order'),
      supabase.from('room_types').select('*').order('name'),
      supabase.from('sections').select('*').order('name'),
    ]);
    setData((roomsRes.data as Room[]) || []);
    setFloors((floorRes.data as Floor[]) || []);
    setRoomTypes((typeRes.data as RoomType[]) || []);
    setSections((secRes.data as Section[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canEdit = canManageMasterData(profile?.role);

  const columns: Column<Room>[] = [
    { key: 'number', label: 'Room No.', render: (r) => <span className="font-mono font-semibold">{r.number}</span> },
    { key: 'floor', label: 'Floor', render: (r) => r.floor?.name || '-' },
    { key: 'room_type', label: 'Type', render: (r) => r.room_type?.name || '-' },
    { key: 'section', label: 'Section', render: (r) => r.section?.name || '-' },
    {
      key: 'housekeeping_status', label: 'HK Status',
      render: (r) => (
        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', HOUSEKEEPING_STATUS_COLORS[r.housekeeping_status])}>
          {HOUSEKEEPING_STATUS_LABELS[r.housekeeping_status]}
        </span>
      ),
    },
    { key: 'occupancy_status', label: 'Occupancy', render: (r) => <span className="capitalize text-xs">{r.occupancy_status}</span> },
  ];

  const fields: FieldDef[] = [
    { key: 'number', label: 'Room Number', type: 'text', required: true, placeholder: '101' },
    {
      key: 'floor_id', label: 'Floor', type: 'select',
      options: floors.map((f) => ({ label: f.name, value: f.id })),
    },
    {
      key: 'room_type_id', label: 'Room Type', type: 'select',
      options: roomTypes.map((rt) => ({ label: rt.name, value: rt.id })),
    },
    {
      key: 'section_id', label: 'Section', type: 'select',
      options: sections.map((s) => ({ label: s.name, value: s.id })),
    },
    {
      key: 'housekeeping_status', label: 'Housekeeping Status', type: 'select', defaultValue: 'clean',
      options: (Object.keys(HOUSEKEEPING_STATUS_LABELS) as HousekeepingStatus[]).map((s) => ({
        label: HOUSEKEEPING_STATUS_LABELS[s], value: s,
      })),
    },
    {
      key: 'occupancy_status', label: 'Occupancy Status', type: 'select', defaultValue: 'vacant',
      options: [
        { label: 'Vacant', value: 'vacant' },
        { label: 'Occupied', value: 'occupied' },
        { label: 'Reserved', value: 'reserved' },
      ],
    },
    {
      key: 'priority', label: 'Priority', type: 'select', defaultValue: 'normal',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Normal', value: 'normal' },
        { label: 'High', value: 'high' },
        { label: 'Urgent', value: 'urgent' },
      ],
    },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
  ];

  return (
    <div className="p-4 md:p-6">
      <CrudTable
        tableName="rooms"
        title="Rooms"
        description="Manage all hotel rooms and their assignments"
        columns={columns}
        fields={fields}
        data={data}
        loading={loading}
        onRefresh={fetchData}
        canEdit={canEdit}
        searchKeys={['number']}
      />
    </div>
  );
}
