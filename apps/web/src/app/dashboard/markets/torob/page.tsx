'use client';
import { useState } from 'react';
import { api, json } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useApp } from '@/components/providers';
import { ErrorMessage, Notice, PageHeading } from '@/components/ui';
type Product = { id:string; price:string; inStock:boolean; statuses:string[]; updatedAt:string };
export default function TorobPage() {
  const { organizationId } = useApp();
  const { data, error, reload } = useResource('/torob/connection');
  const [token,setToken] = useState(''); const [busy,setBusy] = useState(false); const [message,setMessage] = useState(''); const [failure,setFailure] = useState(''); const [products,setProducts] = useState<Product[]>([]);
  async function action(kind:'save'|'test'|'catalog') {
    setBusy(true); setFailure(''); setMessage(''); setProducts([]);
    try {
      const result = await api(kind==='save'?'/torob/connection':`/torob/${kind}`, json(kind==='save'?'PUT':'POST',kind==='save'?{token}:{}),organizationId);
      if(kind==='save'){setToken('');setMessage('توکن رمزگذاری و ذخیره شد؛ هنوز اتصال آزمایش نشده است.');}
      else if(kind==='test')setMessage(`اتصال خواندن فروشگاه ${result.shop.domain} تأیید شد.`);
      else {setProducts(result.products || []);setMessage('فهرست محصولات خود فروشگاه دریافت شد.');}
      await reload();
    }catch(err){setFailure((err as Error).message);}finally{setBusy(false);}
  }
  return <><PageHeading title="اتصال رسمی ترب" description="بررسی محصولات و وضعیت فروشگاه خودتان در ترب"/>
    <Notice>این اتصال قیمت رقبا را دریافت نمی‌کند. دادهٔ محصولات خودتان نباید برای پوشش یا کمینهٔ کل بازار استفاده شود. دریافت رقبا همچنان نیازمند منبع مجاز مستقل است.</Notice>
    <ErrorMessage message={failure || error}/>{message && <Notice>{message}</Notice>}
    <section className="card"><h2>توکن Shop API</h2><p>توکن را از بخش دسترسی API در پنل فروشگاه ترب بگیرید. توکن افزونهٔ همگام‌سازی ووکامرس متفاوت است.</p>
    <p>وضعیت: {data?.verifiedAt?'اتصال خواندن تأیید شده':data?.configured?'ذخیره‌شده، نیازمند آزمون':'پیکربندی نشده'} {data?.domain || ''}</p>
    <form onSubmit={e=>{e.preventDefault();void action('save');}} style={{display:'grid',gap:15,marginTop:20}}><label>توکن رسمی<input type="password" dir="ltr" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} minLength={10} maxLength={2048} required/></label><button className="button primary" disabled={busy}>ذخیره امن توکن</button></form>
    <div className="form-actions" style={{marginTop:20}}><button className="button" disabled={busy || !data?.configured} onClick={()=>void action('test')}>آزمون اتصال</button><button className="button" disabled={busy || !data?.configured} onClick={()=>void action('catalog')}>دریافت محصولات خودم</button></div></section>
    {products.length>0 && <div className="table-wrap" style={{marginTop:25}}><table><thead><tr><th>شناسه محصول</th><th>قیمت / تومان</th><th>موجودی</th><th>آخرین تغییر منبع</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td dir="ltr">{p.id}</td><td>{new Intl.NumberFormat('fa-IR').format(Number(p.price))}</td><td>{p.inStock?'موجود':'ناموجود'}</td><td>{new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(p.updatedAt))}</td></tr>)}</tbody></table></div>}</>;
}
