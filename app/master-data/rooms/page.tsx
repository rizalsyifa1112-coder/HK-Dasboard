'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { CrudTable, type Column, type FieldDef } from '@/components/crud-table';
import { canManageMasterData } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import {
  HOUSEKEEPING_STATUS_LABELS, HOUSEKEEPING_STATUS_COLORS,
  type Room, type Floor, type RoomType, type Building,
} from '@/lib/types';

export default function RoomsPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [roomsRes, floorRes, typeRes, buildingRes] = await Promise.all([
      supabase.from('rooms').select('*, floor:floors(*, building:buildings(*)), room_type:room_types(*)').order('number'),
      supabase.from('floors').select('*, building:buildings(*)').order('sort_order'),
      supabase.from('room_types').select('*').order('name'),
      supabase.from('buildings').select('*').order('sort_order'),
    ]);
    setData((roomsRes.data as Room[]) || []);
    setFloors((floorRes.data as Floor[]) || []);
    setRoomTypes((typeRes.data as RoomType[]) || []);
    setBuildings((buildingRes.data as Building[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canEdit = canManageMasterData(profile?.role);

  const columns: Column<Room>[] = [
    { key: 'number', label: 'Room No.', render: (r) => <span className="font-mono font-semibold">{r.number}</span> },
    { key: 'building', label: 'Building', render: (r) => r.floor?.building?.name || '-' },
    { key: 'floor', label: 'Floor', render: (r) => r.floor?.name || '-' },
    { key: 'room_type', label: 'Type', render: (r) => r.room_type?.name || '-' },
    {
      key: 'housekeeping_status', label: 'HK Status',
      render: (r) => (
        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', HOUSEKEEPING_STATUS_COLORS[r.housekeeping_status])}>
          {HOUSEKEEPING_STATUS_LABELS[r.housekeeping_status]}
        </span>
      ),
    },
  ];

  const fields: FieldDef[] = [
    { key: 'number', label: 'Room Number', type: 'text', required: true, placeholder: '301' },
    {
      key: 'building_id', label: 'Building', type: 'select', required: true, transient: true,
      options: buildings.map((b) => ({ label: b.name, value: b.id })),
      deriveValue: (row) => {
        const floorId = row.floor_id as string | undefined;
        const floor = floors.find((f) => f.id === floorId);
        return floor?.building_id ?? '';
      },
    },
    {
      key: 'floor_id', label: 'Floor', type: 'select', required: true,
      getOptions: (form) => {
        const buildingId = form['building_id'];
        const list = buildingId ? floors.filter((f) => f.building_id === buildingId) : floors;
        return list.map((f) => ({ label: f.name, value: f.id }));
      },
    },
    {
      key: 'room_type_id', label: 'Room Type', type: 'select', required: true,
      options: roomTypes.map((rt) => ({ label: rt.name, value: rt.id })),
    },
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
