'use client';
import { ExternalLink, Globe2, ShieldCheck } from 'lucide-react';
import { Badge } from './ui';
type Connector = { id: string; name: string; marketData: string; sellerOperations: string; documentation?: string; blockers: string[] };
const statuses: Record<string,string> = { SUPPORTED:'پیاده‌سازی شده', UNSUPPORTED:'پشتیبانی نمی‌شود', AWAITING_CREDENTIALS:'نیازمند دسترسی حساب', AWAITING_DOCUMENTATION:'نیازمند مستندات', AWAITING_PERMISSION:'نیازمند مجوز', DEVELOPMENT:'در حال توسعه', VERIFIED_SANDBOX:'آزمایش محدود موفق', VERIFIED_PRODUCTION:'اتصال زنده تأییدشده', UNAVAILABLE:'در دسترس نیست' };
export function ConnectorGrid({connectors}:{connectors:Connector[]}) {
  const list=Array.isArray(connectors)?connectors:[];
  return <div className="connector-grid">{list.map(connector=><article className="panel connector-card" key={connector.id}>
    <div className="connector-top"><span className="market-monogram">{connector.name[0]}</span><Badge tone="warning">{statuses[connector.marketData] || 'وضعیت نامشخص'}</Badge></div>
    <h2>{connector.name}</h2><ul>{connector.blockers.map(reason=><li key={reason}>{reason}</li>)}</ul>
    <div className="connector-capabilities"><span><Globe2 size={16}/>داده رقبا<strong>{statuses[connector.marketData] || 'نامشخص'}</strong></span><span><ShieldCheck size={16}/>دسترسی فروشگاه<strong>{statuses[connector.sellerOperations] || 'نامشخص'}</strong></span></div>
    {connector.documentation && <a className="text-link" href={connector.documentation} target="_blank" rel="noreferrer">مستندات رسمی<ExternalLink size={14}/></a>}
  </article>)}</div>;
}

