'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { CrudTable, type Column, type FieldDef } from '@/components/crud-table';
import { canManageMasterData } from '@/lib/permissions';
import type { Floor } from '@/lib/types';

export default function FloorsPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('floors').select('*').order('sort_order');
    setData((data as Floor[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canEdit = canManageMasterData(profile?.role);

  const columns: Column<Floor>[] = [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'description', label: 'Description', render: (r) => r.description || '-' },
    { key: 'sort_order', label: 'Sort Order', render: (r) => <span className="font-mono">{r.sort_order}</span> },
  ];

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Ground Floor' },
    { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'GF' },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
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
