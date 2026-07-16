'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { CrudTable, type Column, type FieldDef } from '@/components/crud-table';
import type { LoanItem } from '@/lib/types';

export default function LoanItemsPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<LoanItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('loan_items').select('*').order('name');
    setData((data as LoanItem[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canEdit = profile?.role === 'admin';

  const columns: Column<LoanItem>[] = [
    { key: 'name', label: 'Item Name' },
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'stock', label: 'Stock', render: (r) => <span className="font-semibold">{r.stock}</span> },
    { key: 'unit', label: 'Unit' },
  ];

  const fields: FieldDef[] = [
    { key: 'name', label: 'Item Name', type: 'text', required: true, placeholder: 'Setrika' },
    { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'LOAN-STR' },
    { key: 'stock', label: 'Stock', type: 'number', defaultValue: 0 },
    { key: 'unit', label: 'Unit', type: 'text', defaultValue: 'pcs', placeholder: 'pcs' },
  ];

  return (
    <div className="p-4 md:p-6">
      <CrudTable
        tableName="loan_items"
        title="Loan Items"
        description="Master data for items available to loan to guests"
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
