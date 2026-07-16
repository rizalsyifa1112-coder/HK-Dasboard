'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { CrudTable, type Column, type FieldDef } from '@/components/crud-table';
import { canManageMasterData } from '@/lib/permissions';
import type { Floor, Building } from '@/lib/types';

export default function FloorsPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<Floor[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [floorRes, buildingRes] = await Promise.all([
      supabase.from('floors').select('*, building:buildings(*)').order('sort_order'),
      supabase.from('buildings').select('*').order('sort_order'),
    ]);
    setData((floorRes.data as Floor[]) || []);
    setBuildings((buildingRes.data as Building[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canEdit = canManageMasterData(profile?.role);

  const columns: Column<Floor>[] = [
    { key: 'name', label: 'Name' },
    { key: 'building', label: 'Building', render: (r) => r.building?.name || '-' },
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'sort_order', label: 'Sort Order', render: (r) => <span className="font-mono">{r.sort_order}</span> },
  ];

  const fields: FieldDef[] = [
    {
      key: 'building_id', label: 'Building', type: 'select', required: true,
      options: buildings.map((b) => ({ label: b.name, value: b.id })),
    },
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Lantai 3A' },
    { key: 'code', label: 'Code', type: 'text', required: true, placeholder: '3A' },
    { key: 'sort_order', label: 'Sort Order', type: 'number', defaultValue: 0 },
  ];

  return (
    <div className="p-4 md:p-6">
      <CrudTable
        tableName="floors"
        title="Floors"
        description="Manage hotel floor levels"
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
