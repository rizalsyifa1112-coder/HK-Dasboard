'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { CrudTable, type Column, type FieldDef } from '@/components/crud-table';
import { canManageMasterData } from '@/lib/permissions';
import type { Amenity } from '@/lib/types';

export default function AmenitiesPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<Amenity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('amenities').select('*').order('name');
    setData((data as Amenity[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canEdit = canManageMasterData(profile?.role);

  const columns: Column<Amenity>[] = [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'category', label: 'Category', render: (r) => <span className="capitalize">{r.category}</span> },
    { key: 'unit', label: 'Unit', render: (r) => r.unit },
    { key: 'description', label: 'Description', render: (r) => r.description || '-' },
  ];

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Shampoo' },
    { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'SHAMP' },
    {
      key: 'category', label: 'Category', type: 'select', defaultValue: 'general',
      options: [
        { label: 'Bathroom', value: 'bathroom' },
        { label: 'Bedroom', value: 'bedroom' },
        { label: 'Beverage', value: 'beverage' },
        { label: 'General', value: 'general' },
      ],
    },
    { key: 'unit', label: 'Unit', type: 'text', defaultValue: 'pcs', placeholder: 'pcs' },
    { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
  ];

  return (
    <div className="p-4 md:p-6">
      <CrudTable
        tableName="amenities"
        title="Amenities"
        description="Manage hotel amenity inventory items"
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
