'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowUpLeft, ChartNoAxesCombined, CircleAlert, Inbox, LoaderCircle, Moon, Sun, X } from 'lucide-react';
import { useApp } from './providers';

export function Brand({ compact = false }: { compact?: boolean }) {
  const { config } = useApp(); const brand = config.branding || config.brand || {};
  return <Link className="brand" href="/" aria-label="صفحه اصلی"><span className="brand-mark"><ChartNoAxesCombined size={23} strokeWidth={2.2} /></span>{!compact && <span><strong dir="auto">{brand.name || brand.productName || 'Pricing Platform'}</strong><small>پلتفرم هوشمند قیمت‌گذاری</small></span>}</Link>;
}
export function ThemeToggle() { const { theme, toggleTheme } = useApp(); return <button className="icon-button" onClick={toggleTheme} aria-label={theme === 'light' ? 'فعال کردن تم تیره' : 'فعال کردن تم روشن'}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>; }
export function Loading() { return <div className="loading" role="status"><LoaderCircle className="spin" size={24} /><span>در حال دریافت اطلاعات…</span></div>; }
export function ErrorMessage({ message }: { message?: string }) { return message ? <div className="notice error" role="alert"><CircleAlert size={19} /><span>{message}</span></div> : null; }
export function Notice({ children, tone = '' }: { children: React.ReactNode; tone?: string }) { return <div className={`notice ${tone}`}><CircleAlert size={18} /><span>{children}</span></div>; }
export function Empty({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) { return <div className="empty"><span className="empty-icon"><Inbox size={30} /></span><h3>{title}</h3><p>{description}</p>{children}</div>; }
export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: React.ReactNode }) { return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>; }
export function Badge({ children, tone = '' }: { children: React.ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) { return <fieldset className="field field-group"><legend>{label}</legend>{children}</fieldset>; }
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={onClose}><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="modal" onClick={e => e.stopPropagation()} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'Tab') {
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }}><div className="modal-title"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="بستن"><X size={20} /></button></div>{children}</section></div>;
}
export function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link className="text-link" href={href}>{children}<ArrowUpLeft size={17} /></Link>; }
