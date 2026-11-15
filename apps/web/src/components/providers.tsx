'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiRecord } from '@/lib/api';

type ContextValue = {
  config: ApiRecord; user: ApiRecord | null; organizationId: string;
  setOrganizationId: (id: string) => void; loading: boolean; configError: string;
  refreshUser: () => Promise<void>; refreshConfig: () => Promise<void>;
  theme: string; toggleTheme: () => void;
};
const Context = createContext<ContextValue | null>(null);
const initialConfig = { branding: { productName: 'Pricing Platform', subtitle: 'هوشمندی در قیمت، اطمینان در تصمیم' }, auth: { emailEnabled: true, otpEnabled: false, registrationEnabled: true } };

export function Providers({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ApiRecord>(initialConfig);
  const [user, setUser] = useState<ApiRecord | null>(null);
  const [organizationId, setOrg] = useState('');
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState('');
  const [theme, setTheme] = useState('light');
  const setOrganizationId = (id: string) => { setOrg(id); localStorage.setItem('pricing.organization', id); };
  const refreshConfig = useCallback(async () => {
    try {
      const result = await fetch('/service-config', { cache: 'no-store' })
        .then(async response => {
          if (!response.ok) throw new Error('Service configuration unavailable');
          const payload = await response.json();
          return payload.data ?? payload;
        })
        .catch(() => api('/public/config'));
      setConfig(result);
      setConfigError('');
    }
    catch { setConfigError('ارتباط با سرویس برقرار نشد. برای استفاده از امکانات، سرویس API را اجرا کنید.'); }
  }, []);
  const refreshUser = useCallback(async () => {
    try {
      const result = await api('/auth/me');
      const account = result.user ? { ...result.user, memberships: result.memberships || result.user.memberships } : result;
      setUser(account);
      const memberships = account.memberships || [];
      const stored = localStorage.getItem('pricing.organization');
      const current = memberships.find((m: ApiRecord) => (m.organizationId || m.organization?.id) === stored);
      setOrg(current ? stored! : memberships[0]?.organizationId || memberships[0]?.organization?.id || '');
    } catch { setUser(null); setOrg(''); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refreshConfig(); void refreshUser(); const saved = localStorage.getItem('pricing.theme') || 'light'; setTheme(saved); document.documentElement.dataset.theme = saved; }, [refreshConfig, refreshUser]);
  useEffect(() => {
    const brand = config.branding || config.brand || {};
    if (brand.name || brand.productName) document.title = `${brand.name || brand.productName} | هوشمندی قیمت‌گذاری`;
    if (/^#[0-9a-f]{6}$/i.test(brand.primaryColor || '')) document.documentElement.style.setProperty('--accent', brand.primaryColor);
  }, [config]);
  const toggleTheme = () => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); localStorage.setItem('pricing.theme', next); document.documentElement.dataset.theme = next; };
  return <Context.Provider value={{ config, user, organizationId, setOrganizationId, loading, configError, refreshUser, refreshConfig, theme, toggleTheme }}>{children}</Context.Provider>;
}
export function useApp() { const context = useContext(Context); if (!context) throw new Error('Missing application provider'); return context; }
