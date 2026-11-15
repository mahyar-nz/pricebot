import { parseJson, resolvePublic, secureHttpTransport, validatePublicHttpsUrl, type HttpTransport, type Resolver } from './http.js';

const BASE = 'https://api.torob.com/shop-api/v1/';
export interface TorobOwnedProduct { id: string; price: string; currency: 'IRT'; inStock: boolean; statuses: string[]; updatedAt: string; source: 'torob_shop_api' }
/** Official shop-owned catalog only. This API does not establish competitor coverage. */
export class TorobShopConnector {
  constructor(private readonly token: string, private readonly transport: HttpTransport = secureHttpTransport, private readonly resolver: Resolver = resolvePublic) {
    if (!token.trim() || /[\r\n]/.test(token)) throw new Error('TOROB_TOKEN_REQUIRED');
  }
  private async call(path: 'shop/' | 'products/', cursor?: string): Promise<unknown> {
    const target = new URL(path, BASE);
    if (path === 'products/') target.searchParams.set('page_size', '100');
    if (cursor) target.searchParams.set('cursor', cursor);
    const { url, address } = await validatePublicHttpsUrl(target.href, this.resolver);
    const response = await this.transport({ url, address, method: path === 'shop/' ? 'GET' : 'POST', headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json', 'Content-Type': 'application/json' }, ...(path === 'products/' ? { body: '{}' } : {}) });
    if (response.status !== 200) throw new Error(`TOROB_HTTP_${response.status}`);
    return parseJson(response.body);
  }
  async testConnection(): Promise<{ domain: string; status: string }> {
    const raw = await this.call('shop/');
    if (!raw || typeof raw !== 'object' || !('domain' in raw) || typeof raw.domain !== 'string' || !('shop_status' in raw) || typeof raw.shop_status !== 'string') throw new Error('INVALID_TOROB_SHOP');
    return { domain: raw.domain, status: raw.shop_status };
  }
  async readOwnedProducts(): Promise<TorobOwnedProduct[]> {
    const products = new Map<string, TorobOwnedProduct>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 1000; page++) {
      const raw = await this.call('products/', cursor) as { results?: unknown; next?: unknown };
      if (!raw || !Array.isArray(raw.results) || raw.results.length > 500 || !(raw.next === null || typeof raw.next === 'string')) throw new Error('INVALID_TOROB_PAGE');
      for (const value of raw.results) {
        const p = value as Record<string, unknown>;
        if (!p || typeof p.product_id !== 'string' || !p.product_id || typeof p.price !== 'number' || !Number.isSafeInteger(p.price) || p.price < 0 || typeof p.availability !== 'boolean' || !Array.isArray(p.statuses) || !p.statuses.every(x => typeof x === 'string') || typeof p.updated_at !== 'string' || !Number.isFinite(Date.parse(p.updated_at))) throw new Error('INVALID_TOROB_PRODUCT');
        const normalized: TorobOwnedProduct = { id: p.product_id, price: String(p.price), currency: 'IRT', inStock: p.availability, statuses: p.statuses as string[], updatedAt: p.updated_at, source: 'torob_shop_api' };
        const previous = products.get(normalized.id);
        if (!previous || Date.parse(normalized.updatedAt) >= Date.parse(previous.updatedAt)) products.set(normalized.id, normalized);
      }
      if (raw.next === null) return [...products.values()];
      const next = new URL(raw.next as string, BASE);
      if (next.origin !== new URL(BASE).origin || next.pathname !== '/shop-api/v1/products/' || next.username || next.password || next.hash) throw new Error('UNTRUSTED_TOROB_PAGINATION');
      cursor = next.searchParams.get('cursor') ?? undefined;
      if (!cursor || cursors.has(cursor)) throw new Error('TOROB_PAGINATION_LOOP');
      cursors.add(cursor);
      // Sequential calls below the documented per-shop limit; 429 is surfaced, never bypassed.
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('TOROB_CATALOG_LIMIT');
  }
}
