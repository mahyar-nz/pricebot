import { createHmac, timingSafeEqual } from 'node:crypto';
import { decimal, nonNegative } from '../money.js';
import type { ConnectionResult, Currency, PriceUpdateRequest, PriceUpdateResult, SellerProduct } from '../types.js';
import { type HttpTransport, type Resolver, parseJson, resolvePublic, secureHttpTransport, validatePublicHttpsUrl } from './http.js';
import type { SellerConnector } from './registry.js';

export interface WooCommerceConfig {storeUrl: string; consumerKey?: string; consumerSecret?: string; currency: Currency; readOnly?: boolean; connectionKind?: 'woocommerce' | 'bridge'; bridgeToken?: string}
interface WooProduct {
  id: number; parent_id?: number; sku?: string; name?: string; type?: string; status?: string; currency?: string;
  price?: string; regular_price?: string; sale_price?: string; stock_status?: string; stock_quantity?: number | null;
  date_modified_gmt?: string; attributes?: {name: string; option?: string; options?: string[]}[];
  images?: {src: string}[]; image?: {src: string}; variations?: number[];
}
export class WooCommerceConnector implements SellerConnector {
  constructor(private readonly config: WooCommerceConfig, private readonly transport: HttpTransport = secureHttpTransport, private readonly resolver: Resolver = resolvePublic) {}
  private async call(path: string, method: 'GET' | 'PUT' = 'GET', body?: unknown): Promise<unknown> {
    const bridge = this.config.connectionKind === 'bridge';
    if (bridge ? !this.config.bridgeToken : !this.config.consumerKey || !this.config.consumerSecret) throw new Error('WOOCOMMERCE_CREDENTIALS_REQUIRED');
    if (method !== 'GET' && (bridge || this.config.readOnly)) throw new Error('STORE_READ_ONLY');
    const raw = new URL(this.config.storeUrl);
    if (raw.search || raw.hash) throw new Error('INVALID_STORE_URL');
    const target = `${raw.toString().replace(/\/$/, '')}/wp-json/${bridge ? 'pricing-bridge/v1' : 'wc/v3'}/${path}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const {url, address} = await validatePublicHttpsUrl(target, this.resolver);
      const authorization: Record<string, string> = bridge ? {'X-Pricing-Token': this.config.bridgeToken!} : {'Authorization': `Basic ${Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString('base64')}`};
      const result = await this.transport({url, address, method, headers: {...authorization, 'Accept': 'application/json', 'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
      if (result.status >= 300 && result.status < 400) throw new Error('STORE_REDIRECT_REJECTED');
      if ([429, 502, 503, 504].includes(result.status) && method === 'GET' && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 250)); continue;
      }
      if (result.status < 200 || result.status >= 300) throw new Error(`WOOCOMMERCE_HTTP_${result.status}`);
      return parseJson(result.body);
    }
    throw new Error('WOOCOMMERCE_RETRY_EXHAUSTED');
  }
  private normalize(raw: unknown, parentId?: string): SellerProduct {
    if (!raw || typeof raw !== 'object' || !Number.isSafeInteger((raw as WooProduct).id)) throw new Error('INVALID_WOOCOMMERCE_PRODUCT');
    const p = raw as WooProduct;
    if (p.currency && p.currency !== this.config.currency) throw new Error('CURRENCY_MISMATCH');
    const price = p.price || p.regular_price || '0';
    nonNegative(price);
    return {id: String(p.id), parentId, sku: p.sku ?? '', name: p.name ?? '', type: parentId ? 'variation' : p.type === 'variable' ? 'variable' : 'simple', status: p.status ?? 'publish', price, regularPrice: p.regular_price ?? '', salePrice: p.sale_price ?? '', currency: this.config.currency, inStock: p.stock_status === 'instock', stockQuantity: p.stock_quantity ?? null, modifiedAt: p.date_modified_gmt ? `${p.date_modified_gmt.replace(/Z$/, '')}Z` : '', attributes: Object.fromEntries((p.attributes ?? []).map(a => [a.name, a.option ?? a.options?.join(', ') ?? ''])), images: p.images?.map(i => i.src) ?? (p.image ? [p.image.src] : [])};
  }
  async testConnection(): Promise<ConnectionResult> {
    try {
      const result = await this.call('products?per_page=1');
      if (!Array.isArray(result)) throw new Error('INVALID_WOOCOMMERCE_RESPONSE');
      if (result.length) this.normalize(result[0]);
      return {ok: true, status: 'CONNECTED', message: 'اتصال خواندن کاتالوگ تأیید شد؛ دسترسی نوشتن هنوز آزموده نشده است.'};
    } catch (error) {return {ok: false, status: 'FAILED', message: error instanceof Error ? error.message : 'CONNECTION_FAILED'};}
  }
  async syncProducts(options: {modifiedAfter?: string} = {}): Promise<SellerProduct[]> {
    if (options.modifiedAfter && !Number.isFinite(Date.parse(options.modifiedAfter))) throw new Error('INVALID_SYNC_DATE');
    const products: SellerProduct[] = [];
    for (let page = 1; page <= 1000; page++) {
      const query = new URLSearchParams({per_page: '100', page: String(page), orderby: 'id', order: 'asc'});
      if (options.modifiedAfter) query.set('modified_after', options.modifiedAfter);
      const raw = await this.call(`products?${query}`);
      if (!Array.isArray(raw)) throw new Error('INVALID_WOOCOMMERCE_RESPONSE');
      for (const row of raw as WooProduct[]) {
        const product = this.normalize(row);
        products.push(product);
        if (product.type === 'variable') {
          for (let variantPage = 1; variantPage <= 100; variantPage++) {
            const variations = await this.call(`products/${product.id}/variations?per_page=100&page=${variantPage}`);
            if (!Array.isArray(variations)) throw new Error('INVALID_WOOCOMMERCE_VARIATIONS');
            products.push(...variations.map(v => this.normalize(v, product.id)));
            if (variations.length < 100) break;
            if (variantPage === 100) throw new Error('VARIATION_SYNC_LIMIT');
          }
        }
      }
      if (raw.length < 100) return products;
    }
    throw new Error('CATALOG_SYNC_LIMIT');
  }
  private path(id: string, parentId?: string): string {
    if (!/^\d+$/.test(id) || (parentId !== undefined && !/^\d+$/.test(parentId))) throw new Error('INVALID_EXTERNAL_PRODUCT_ID');
    return parentId ? `products/${parentId}/variations/${id}` : `products/${id}`;
  }
  async getProduct(id: string, parentId?: string): Promise<SellerProduct> {return this.normalize(await this.call(this.path(id, parentId)), parentId);}
  /** Caller must reserve an idempotency key and run the mandatory safety pipeline first. */
  async updatePrice(input: PriceUpdateRequest): Promise<PriceUpdateResult> {
    if (this.config.readOnly || this.config.connectionKind === 'bridge') throw new Error('STORE_READ_ONLY');
    if (input.currency !== this.config.currency) throw new Error('CURRENCY_MISMATCH');
    if (nonNegative(input.price).lte(0)) throw new Error('INVALID_PRICE');
    const old = await this.getProduct(input.productId, input.parentId);
    if (old.type === 'variable') throw new Error('VARIABLE_PARENT_NOT_PRICEABLE');
    if (!decimal(old.price).eq(decimal(input.expectedPrice))) throw new Error('REMOTE_PRICE_CONFLICT');
    // Preserve a running promotion by refusing changes rather than silently cancelling a sale.
    if (old.salePrice) throw new Error('ACTIVE_SALE_REQUIRES_MANUAL_REVIEW');
    await this.call(this.path(input.productId, input.parentId), 'PUT', {regular_price: input.price});
    const updated = await this.getProduct(input.productId, input.parentId);
    if (!decimal(updated.price).eq(decimal(input.price))) throw new Error('REMOTE_PRICE_VERIFICATION_FAILED');
    return {verified: true, previousPrice: old.price, price: updated.price, product: updated};
  }
}
export function verifyWooCommerceWebhook(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(signature, 'base64');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export {isPublicAddress, validatePublicHttpsUrl} from './http.js';
