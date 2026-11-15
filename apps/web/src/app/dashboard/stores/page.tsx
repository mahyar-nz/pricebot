'use client';
import { FormEvent, useState } from 'react';
import { ExternalLink, KeyRound, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, date, json, rows } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useApp } from '@/components/providers';
import { Badge, Empty, ErrorMessage, Field, Loading, Modal, Notice, PageHeading } from '@/components/ui';

export default function Stores() {
  const { organizationId } = useApp();
  const { data, error, loading, reload } = useResource('/stores');
  const [modal, setModal] = useState(false), [formError, setFormError] = useState('');
  const [pending, setPending] = useState(''), [message, setMessage] = useState('');
  const [connectionKind, setConnectionKind] = useState('bridge');
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending('create'); setFormError('');
    try {
      await api('/stores', json('POST', { ...Object.fromEntries(new FormData(e.currentTarget)), readOnly: true }), organizationId);
      setModal(false); setMessage('اتصال فقط‌خواندنی ذخیره شد. اکنون آن را آزمایش کنید.'); await reload();
    } catch (err) { setFormError((err as Error).message); } finally { setPending(''); }
  }
  async function action(id: string, kind: string) {
    setPending(id); setFormError(''); setMessage('');
    try {
      const result = await api(`/stores/${id}/${kind}`, json('POST'), organizationId);
      setMessage(kind === 'test' ? (result.message || 'آزمایش اتصال انجام شد.') : `همگام‌سازی انجام شد. ${result.imported ?? 0} محصول پردازش شد.`);
      await reload();
    } catch (err) { setFormError((err as Error).message); } finally { setPending(''); }
  }
  return <>
    <PageHeading eyebrow="مرکز اتصال فروشگاه" title="فروشگاه‌ها" description="محصولات فروشگاه خود را برای پایش وارد کنید.">
      <button className="button primary" onClick={() => { setModal(true); setFormError(''); }}><Plus size={18}/>افزودن ووکامرس</button>
    </PageHeading>
    <ErrorMessage message={error || (!modal ? formError : '')}/>
    {message && <Notice tone="success">{message}</Notice>}
    <Notice>اتصال‌های این فرم فقط‌خواندنی هستند؛ همگام‌سازی هیچ قیمت یا موجودی‌ای را در فروشگاه تغییر نمی‌دهد.</Notice>
    {loading ? <Loading/> : rows(data).length ? <div className="store-grid">{rows(data).map(store => {
      const status = String(store.status).toLowerCase();
      return <article className="panel store-card" key={store.id}>
        <div className="store-card-top"><span className="woo-logo">Woo</span><Badge tone={status === 'connected' ? 'success' : 'warning'}>{status === 'connected' ? 'خواندن تأییدشده' : status === 'failed' ? 'خطای اتصال' : 'نیازمند بررسی'}</Badge></div>
        <h2>{store.name}</h2><a className="store-url" href={store.url} dir="ltr" target="_blank" rel="noreferrer">{store.url}<ExternalLink size={13}/></a>
        <div className="store-details"><span>دسترسی<b>{store.readOnly ? 'فقط‌خواندنی' : 'نوشتن نیازمند کنترل اجرا'}</b></span><span>روش اتصال<b>{store.connectionKind === 'bridge' ? 'افزونه رابط' : 'کلید ووکامرس'}</b></span><span>واحد قیمت<b>{store.currency === 'IRT' ? 'تومان' : 'ریال'}</b></span><span>آخرین همگام‌سازی<b>{date(store.lastSyncedAt)}</b></span></div>
        {store.lastError && <ErrorMessage message={store.lastError}/>}
        <div className="card-actions"><button className="button secondary" disabled={!!pending} onClick={() => action(store.id, 'test')}><ShieldCheck size={16}/>{pending === store.id ? 'در حال پردازش…' : 'آزمایش اتصال'}</button><button className="button primary" disabled={!!pending || status !== 'connected'} onClick={() => action(store.id, 'sync')}><RefreshCw size={16}/>همگام‌سازی</button></div>
      </article>;
    })}</div> : <section className="panel"><Empty title="فروشگاه شما، آماده اتصال" description="با افزونه رابط یا کلید خواندن ووکامرس متصل شوید."><button className="button primary" onClick={() => setModal(true)}><Plus size={18}/>اتصال اولین فروشگاه</button></Empty></section>}
    <section className="panel connection-guide"><KeyRound size={27}/><div><h3>افزونه رابط فروشگاه</h3><p>نسخهٔ آزمایشی فقط محصولات و تنوع‌ها را می‌خواند. ابتدا روی فروشگاه آزمایشی نصب کنید؛ سپس از «ووکامرس ← رابط پایش قیمت» کلید بسازید. این افزونه با ترب و ترب‌پی متفاوت است.</p><a className="button secondary" href="/downloads/pricing-bridge-0.1.0.zip" download>دریافت افزونه آزمایشی</a></div></section>
    {modal && <Modal title="اتصال فروشگاه ووکامرس" onClose={() => !pending && setModal(false)}><form className="form-stack" onSubmit={create}>
      <ErrorMessage message={formError}/>
      <Field label="روش اتصال"><select name="connectionKind" value={connectionKind} onChange={e => setConnectionKind(e.target.value)}><option value="bridge">افزونه رابط — آزمایشی و فقط‌خواندنی</option><option value="woocommerce">کلید REST API ووکامرس</option></select></Field>
      <Field label="نام فروشگاه"><input name="name" required minLength={2} maxLength={100} placeholder="فروشگاه من"/></Field>
      <Field label="نشانی فروشگاه" hint="نشانی اصلی فروشگاه با HTTPS، بدون wp-admin"><input name="url" type="url" dir="ltr" pattern="https://.*" required placeholder="https://your-store.com"/></Field>
      {connectionKind === 'bridge' ? <Field label="کلید افزونه رابط"><input name="bridgeToken" type="password" dir="ltr" required pattern="pb_[a-f0-9]{64}" autoComplete="new-password" placeholder="pb_…"/></Field> : <><Field label="Consumer Key"><input name="consumerKey" dir="ltr" required autoComplete="off" placeholder="ck_…"/></Field><Field label="Consumer Secret"><input name="consumerSecret" type="password" dir="ltr" required autoComplete="new-password" placeholder="cs_…"/></Field><Notice>کلید را با مجوز «خواندن» در ووکامرس ← پیکربندی ← پیشرفته ← REST API بسازید.</Notice></>}
      <Field label="واحد واقعی قیمت در فروشگاه"><select name="currency"><option value="IRT">تومان (IRT)</option><option value="IRR">ریال (IRR)</option></select></Field>
      <Notice>کلید در سرور رمزنگاری می‌شود. آزمایش اتصال و همگام‌سازی، درخواست خواندن واقعی به فروشگاه می‌فرستند.</Notice>
      <button disabled={!!pending} className="button primary full">{pending ? 'در حال ذخیره…' : 'ذخیره امن اتصال فقط‌خواندنی'}</button>
    </form></Modal>}
  </>;
}
