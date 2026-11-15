'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowUpLeft, Building2, ChevronDown, CircleStop, CircleUserRound, CreditCard, LayoutDashboard, LifeBuoy, LogOut, Menu, Package, Settings2, ShieldCheck, SlidersHorizontal, Store, Unplug, X } from 'lucide-react';
import { useApp } from './providers';
import { Badge, Brand, Loading, ThemeToggle } from './ui';
import { api, json } from '@/lib/api';

const links = [
  { href: '/dashboard', title: 'نمای کلی', icon: LayoutDashboard },
  { href: '/dashboard/products', title: 'محصولات', icon: Package },
  { href: '/dashboard/rules', title: 'قیمت‌گذاری', icon: SlidersHorizontal },
  { href: '/dashboard/markets', title: 'بازارها و اتصال‌ها', icon: Unplug },
  { href: '/dashboard/stores', title: 'فروشگاه‌ها', icon: Store },
  { href: '/dashboard/billing', title: 'اشتراک و مصرف', icon: CreditCard },
  { href: '/dashboard/settings', title: 'تنظیمات و تیم', icon: Settings2 },
];
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, organizationId, setOrganizationId, refreshUser, config } = useApp();
  const pathname = usePathname(); const router = useRouter(); const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  if (loading || !user) return <Loading />;
  const membership = user.memberships?.find((item: any) => item.organizationId === organizationId);
  const active = links.find(item => item.href === pathname || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`)));
  return <div className="app-shell">{mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}<aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}><div className="sidebar-brand"><Brand /><button className="icon-button mobile-menu" aria-label="بستن فهرست" onClick={() => setMobileOpen(false)}><X size={20} /></button></div><div className="organization-picker"><span className="org-avatar"><Building2 size={20} /></span><label><small>فضای کاری</small><select aria-label="انتخاب سازمان" value={organizationId} onChange={e => setOrganizationId(e.target.value)}>{user.memberships?.map((m: any) => <option value={m.organizationId} key={m.organizationId}>{m.organization?.name || 'سازمان'}</option>)}</select></label><ChevronDown size={15} /></div><div className="nav-label">مدیریت فروشگاه</div><nav aria-label="داشبورد">{links.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={active?.href === item.href ? 'active' : ''}><Icon size={20} strokeWidth={1.65} /><span>{item.title}</span>{item.href === '/dashboard/rules' && <span className="nav-tag">کنترل‌شده</span>}</Link>; })}{user.platformRole === 'SUPER_ADMIN' && <Link href="/admin"><ShieldCheck size={20} /><span>مدیریت پلتفرم</span></Link>}</nav><div className="sidebar-bottom"><div className="sidebar-help"><span className="help-icon"><LifeBuoy size={22} /></span><h4>مسیر روشن‌تر با راهنما</h4><p>از اتصال فروشگاه تا محاسبه اولین پیشنهاد.</p><Link href="/how-it-works">راهنمای شروع<ArrowUpLeft size={16} /></Link></div><div className="sidebar-status"><span className="live-dot" /> فضای کاری مستقل سازمان شما</div></div></aside><div className="app-main"><header className="app-header"><div className="header-breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="باز کردن فهرست"><Menu size={21} /></button><span>فضای کاری</span><span className="slash">/</span><strong>{active?.title || 'مدیریت پلتفرم'}</strong></div><div className="header-actions"><span className="header-date">{new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Tehran' }).format(new Date())}</span><ThemeToggle /><span className="header-divider" /><Link href="/dashboard/settings" className="user-avatar" title={user.name}><CircleUserRound size={23} /></Link><span className="header-user">{user.name}<small>{membership?.role === 'OWNER' ? 'مالک سازمان' : membership?.role || 'کاربر'}</small></span><button title="خروج از حساب" aria-label="خروج از حساب" className="icon-button" onClick={async () => { await api('/auth/logout', json('POST')); await refreshUser(); router.replace('/login'); }}><LogOut size={18} /></button></div></header><main className="dashboard-content">{membership?.organization?.emergencyStop && <div className="notice warning"><CircleStop size={18} />توقف اضطراری فعال است. اجرای تغییر قیمت متوقف شده است.</div>}{children}</main><footer className="app-footer"><span>{config.branding?.name || 'Pricing Platform'} · فضای کاری شما</span><span><ShieldCheck size={14} /> زمان‌ها به وقت تهران</span></footer></div></div>;
}
