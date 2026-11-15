'use client';
import Link from 'next/link';
import { FileUp } from 'lucide-react';
import { ConnectorGrid } from '@/components/connector-grid';
import { ErrorMessage, Loading, Notice, PageHeading } from '@/components/ui';
import { useResource } from '@/lib/hooks';
export default function Markets(){const {data,error,loading}=useResource('/connectors');return <><PageHeading eyebrow="دسترسی‌های شفاف" title="بازارها و اتصال‌ها" description="قابلیت پیاده‌سازی‌شده و دسترسی تأییدشده، دو وضعیت متفاوت هستند."><Link className="button secondary" href="/dashboard/products"><FileUp size={17}/>ورود داده مجاز</Link></PageHeading><Link className="button primary" href="/dashboard/markets/torob">اتصال رسمی فروشگاه ترب</Link><ErrorMessage message={error}/><Notice>داده زنده برای اتصال‌های تأییدنشده ارائه نمی‌شود. برای شروع می‌توانید مشاهدات مجاز خود را در صفحه محصول با منبع و زمان مشخص ثبت کنید.</Notice>{loading?<Loading/>:<ConnectorGrid connectors={data}/>}</>;}

