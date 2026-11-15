'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useApp } from '@/components/providers';

export function useResource<T = any>(path: string, tenant = true) {
  const { organizationId } = useApp();
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (tenant && !organizationId) { setLoading(false); return; }
    setLoading(true); setError('');
    try { setData(await api<T>(path, {}, tenant ? organizationId : undefined)); }
    catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }, [path, organizationId, tenant]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}
