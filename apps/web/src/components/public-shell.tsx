'use client';
import Link from 'next/link';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Brand, ThemeToggle } from './ui';
import { useApp } from './providers';

export function PublicShell({ children }: { children: React.ReactNode }) {
  const { user, config } = useApp(); const [open, setOpen] = useState(false);
  return <><header className="public-header"><div className="public-nav container"><Brand /><nav aria-label="ناوبری اصلی" className={open ? 'open' : ''}><Link href="/features" onClick={() => setOpen(false)}>امکانات</Link><Link href="/integrations" onClick={() => setOpen(false)}>اتصال‌ها</Link><Link href="/pricing" onClick={() => setOpen(false)}>تعرفه‌ها</Link><Link href="/how-it-works" onClick={() => setOpen(false)}>چطور کار می‌کند؟</Link></nav><div className="nav-actions"><ThemeToggle /><Link className="button small secondary" href={user ? '/dashboard' : '/login'}>{user ? 'ورود به پیشخوان' : 'ورود'}<ArrowLeft size={15} /></Link><button className="icon-button mobile-menu" aria-label="فهرست" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button></div></div></header><main>{children}</main><footer className="public-footer container"><div><Brand /><p>تصمیم‌های روشن‌تر برای فروشگاه شما.</p></div><div className="footer-links"><Link href="/about">درباره پلتفرم</Link><Link href="/faq">پرسش‌های متداول</Link><Link href="/privacy">حریم خصوصی</Link><Link href="/terms">شرایط استفاده</Link>{config.branding?.supportEmail && <a href={`mailto:${config.branding.supportEmail}`}>تماس با پشتیبانی</a>}</div><div className="footer-note">نسخه در حال توسعه · تمام قیمت‌ها با واحد مشخص نمایش داده می‌شوند.</div></footer></>;
}
