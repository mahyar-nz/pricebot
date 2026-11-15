'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api, json } from '@/lib/api';
import { Brand, ErrorMessage, Field, ThemeToggle } from './ui';
import { useApp } from './providers';

export function AuthForm({ register = false }: { register?: boolean }) {
  const { config, configError, refreshUser } = useApp(); const router = useRouter();
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const [mode, setMode] = useState('email'); const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState(''); const [challengeId, setChallengeId] = useState('');
  const auth = config.auth || {};
  const activeMode = auth.emailEnabled === false ? 'otp' : mode;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setPending(true); const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (activeMode === 'otp') {
        if (!sent) { const result = await api('/auth/otp/request', json('POST', { phone, purpose: 'login' })); setChallengeId(result.challengeId || result.id || ''); setSent(true); return; }
        await api('/auth/otp/verify', json('POST', { phone, code: data.code, challengeId, purpose: 'login' }));
      } else { await api(register ? '/auth/register' : '/auth/login', json('POST', data)); }
      await refreshUser(); router.push('/dashboard');
    } catch (err) { setError((err as Error).message); } finally { setPending(false); }
  }
  return <div className="auth-page"><div className="auth-main"><header><Brand /><ThemeToggle /></header><Link className="back-link" href="/"><ArrowRight size={16} />بازگشت به صفحه اصلی</Link><div className="auth-form-wrap"><div className="auth-symbol"><LockKeyhole size={25} /></div><h1>{register ? 'یک شروع هوشمندانه' : 'خوش برگشتید.'}</h1><p>{register ? 'حساب خود را بسازید و فضای کاری فروشگاهتان را آماده کنید.' : 'برای ادامه، وارد فضای کاری خود شوید.'}</p><ErrorMessage message={configError || error} />{register && auth.registrationEnabled === false ? <div className="notice">ثبت‌نام جدید در حال حاضر غیرفعال است.</div> : <><div className="auth-tabs">{auth.emailEnabled !== false && <button className={activeMode === 'email' ? 'active' : ''} onClick={() => setMode('email')}>ایمیل و رمز عبور</button>}{auth.otpEnabled && <button className={activeMode === 'otp' ? 'active' : ''} onClick={() => setMode('otp')}>رمز یک‌بارمصرف</button>}</div><form onSubmit={submit} className="form-stack">{activeMode === 'email' ? <>{register && <><Field label="نام و نام خانوادگی"><input name="name" autoComplete="name" required minLength={2} placeholder="نام شما" /></Field><Field label="نام سازمان یا فروشگاه"><input name="organizationName" required minLength={2} placeholder="مثلاً فروشگاه آبان" /></Field></>}<Field label="ایمیل"><input name="email" type="email" dir="ltr" autoComplete="email" placeholder="you@example.com" required /></Field><Field label="رمز عبور" hint={register ? 'حداقل ۱۲ نویسه؛ ترکیبی از کلمات، اعداد و نشانه‌ها انتخاب کنید.' : undefined}><input name="password" type="password" dir="ltr" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 12 : 1} required /></Field></> : <><Field label="شماره موبایل"><input type="tel" dir="ltr" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="09123456789" required disabled={sent} /></Field>{sent && <Field label="کد ارسال‌شده"><input name="code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></Field>}</>}<button className="button primary full" disabled={pending || !!configError}>{pending ? 'در حال انجام…' : activeMode === 'otp' && !sent ? 'دریافت کد ورود' : register ? 'ساخت حساب و ورود' : 'ورود به پیشخوان'}<ArrowLeft size={18} /></button>{sent && <button type="button" className="text-button" onClick={() => { setSent(false); setChallengeId(''); }}>اصلاح شماره موبایل</button>}</form><p className="auth-switch">{register ? 'قبلاً حساب ساخته‌اید؟' : 'هنوز حساب ندارید؟'} <Link href={register ? '/login' : '/register'}>{register ? 'وارد شوید' : 'ساخت حساب'}</Link></p></>}<small className="auth-legal">با ادامه، <Link href="/terms">شرایط استفاده</Link> و <Link href="/privacy">حریم خصوصی</Link> را می‌پذیرید.</small></div></div><aside className="auth-aside"><div className="auth-orbit"><span /><span /><span /><div><ShieldCheck size={64} strokeWidth={1.2} /></div></div><div className="eyebrow">تصمیم بهتر از اینجا شروع می‌شود</div><h2>داده روشن.<br />قیمت حساب‌شده.<br /><span>خیال آسوده‌تر.</span></h2><p>فضای کاری مستقل برای سازمان شما، با کنترل دسترسی و ثبت تصمیم‌های قیمت‌گذاری.</p><span className="aside-caption">پایش بازار · مدیریت قیمت · محافظت از سود</span></aside></div>;
}

