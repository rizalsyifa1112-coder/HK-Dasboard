'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { CrudTable, type Column, type FieldDef } from '@/components/crud-table';
import { canManageMasterData } from '@/lib/permissions';
import type { Section, Floor } from '@/lib/types';

export default function SectionsPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<Section[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [secRes, floorRes] = await Promise.all([
      supabase.from('sections').select('*, floor:floors(*)').order('name'),
      supabase.from('floors').select('*').order('sort_order'),
    ]);
    setData((secRes.data as Section[]) || []);
    setFloors((floorRes.data as Floor[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canEdit = canManageMasterData(profile?.role);

  const columns: Column<Section>[] = [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'floor', label: 'Floor', render: (r) => r.floor?.name || '-' },
    { key: 'description', label: 'Description', render: (r) => r.description || '-' },
  ];

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Wing A' },
    { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'WING-A' },
    {
      key: 'floor_id', label: 'Floor', type: 'select',
      options: floors.map((f) => ({ label: f.name, value: f.id })),
    },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
  ];

  return (
    <div className="p-4 md:p-6">
      <CrudTable
        tableName="sections"
        title="Sections"
        description="Manage housekeeping sections per floor"
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
