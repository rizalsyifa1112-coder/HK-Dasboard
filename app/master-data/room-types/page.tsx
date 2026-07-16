'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { CrudTable, type Column, type FieldDef } from '@/components/crud-table';
import { canManageMasterData } from '@/lib/permissions';
import type { RoomType } from '@/lib/types';

export default function RoomTypesPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('room_types').select('*').order('name');
    setData((data as RoomType[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canEdit = canManageMasterData(profile?.role);

  const columns: Column<RoomType>[] = [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'capacity', label: 'Capacity', render: (r) => `${r.capacity} guests` },
    { key: 'base_price', label: 'Base Price', render: (r) => `$${r.base_price.toFixed(2)}` },
    { key: 'description', label: 'Description', render: (r) => r.description || '-' },
  ];

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Standard Room' },
    { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'STD' },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
    { key: 'capacity', label: 'Capacity (guests)', type: 'number', defaultValue: 2 },
    { key: 'base_price', label: 'Base Price ($)', type: 'number', defaultValue: 0 },
  ];

  return (
    <div className="p-4 md:p-6">
      <CrudTable
        tableName="room_types"
        title="Room Types"
        description="Manage room categories and pricing"
        columns={columns}
        fields={fields}
        data={data}
        loading={loading}
        onRefresh={fetchData}
        canEdit={canEdit}
        searchKeys={['name', 'code']}
      />
    </div>
  );
}
