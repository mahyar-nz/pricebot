import { convertCurrency, Money, nonNegative } from '../money.js';
import type { Currency } from '../types.js';
import { parseJson, resolvePublic, secureHttpTransport, validatePublicHttpsUrl, type HttpTransport, type Resolver } from './http.js';

type Row = Record<string, unknown>;
function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_CATALOG_OBJECT');
  return value as Row;
}
function productId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('INVALID_CATALOG_ID');
  return value;
}
function amount(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_CATALOG_AMOUNT');
  return nonNegative(value).toFixed();
}
export interface PreviewProduct { id: number; title: string; price: string; currency: Currency; availability: 'instock' | 'outofstock' }
/** The WordPress preview omits currency and covers only a sample; neither may be inferred. */
export function parseTorobPreview(raw: unknown, currency: Currency): PreviewProduct[] {
  if (!['IRR', 'IRT'].includes(currency)) throw new Error('UNSUPPORTED_CURRENCY');
  const rows = object(raw).products;
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('INVALID_PREVIEW_SAMPLE');
  const seen = new Set<number>();
  return rows.map(value => {
    const p = object(value), id = productId(p.page_unique);
    if (seen.has(id)) throw new Error('DUPLICATE_PREVIEW_ID');
    seen.add(id);
    if (typeof p.title !== 'string' || !p.title.trim() || !['instock', 'outofstock'].includes(String(p.availability))) throw new Error('INVALID_PREVIEW_PRODUCT');
    return { id, title: p.title, price: amount(p.current_price), currency, availability: p.availability as PreviewProduct['availability'] };
  });
}
export interface PublicCatalogProduct {
  id: number; price: string; currency: Currency; inStock: boolean; requiresVariantReview: boolean;
  priceRange: { min: string; max: string } | null;
}
export function parsePublicCatalogProduct(raw: unknown): PublicCatalogProduct {
  const p = object(raw), prices = object(p.prices), id = productId(p.id);
  if (!['IRR', 'IRT'].includes(String(prices.currency_code)) || typeof prices.currency_minor_unit !== 'number' || !Number.isInteger(prices.currency_minor_unit) || prices.currency_minor_unit < 0 || prices.currency_minor_unit > 8) throw new Error('INVALID_PUBLIC_CURRENCY');
  if (typeof p.is_in_stock !== 'boolean' || typeof p.has_options !== 'boolean' || typeof p.type !== 'string') throw new Error('INVALID_PUBLIC_PRODUCT');
  const unit = prices.currency_minor_unit;
  const major = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{1,24}$/.test(value)) throw new Error('INVALID_MINOR_AMOUNT');
    return new Money(value).div(new Money(10).pow(unit)).toFixed();
  };
  let priceRange: PublicCatalogProduct['priceRange'] = null;
  if (prices.price_range != null) {
    const range = object(prices.price_range);
    priceRange = { min: major(range.min_amount), max: major(range.max_amount) };
    if (new Money(priceRange.min).gt(priceRange.max)) throw new Error('INVALID_PRICE_RANGE');
  }
  return { id, price: major(prices.price), currency: prices.currency_code as Currency, inStock: p.is_in_stock, requiresVariantReview: p.type !== 'simple' || p.has_options || priceRange !== null, priceRange };
}

/** Public sample reader, deliberately not a SellerConnector: it has no price-write or sync method. */
export class PublicCatalogReader {
  constructor(private readonly storeUrl: string, private readonly transport: HttpTransport = secureHttpTransport, private readonly resolver: Resolver = resolvePublic) {}
  async readSample(ids: number[]): Promise<PublicCatalogProduct[]> {
    if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw new Error('INVALID_SAMPLE_IDS');
    ids.forEach(productId);
    const base = new URL(this.storeUrl);
    if (base.search || base.hash) throw new Error('INVALID_STORE_URL');
    const target = new URL(`${base.href.replace(/\/$/, '')}/wp-json/wc/store/v1/products`);
    target.search = new URLSearchParams({ include: ids.join(','), per_page: '100' }).toString();
    const { url, address } = await validatePublicHttpsUrl(target.href, this.resolver);
    const result = await this.transport({ url, address, method: 'GET', headers: { Accept: 'application/json' } });
    if (result.status !== 200) throw new Error(`PUBLIC_CATALOG_HTTP_${result.status}`);
    const raw = parseJson(result.body);
    if (!Array.isArray(raw) || raw.length > ids.length) throw new Error('INVALID_PUBLIC_SAMPLE');
    const rows = raw.map(parsePublicCatalogProduct);
    if (new Set(rows.map(p => p.id)).size !== rows.length || rows.some(p => !ids.includes(p.id))) throw new Error('INVALID_PUBLIC_SAMPLE_IDS');
    return rows;
  }
}
export function compareCatalogSample(preview: PreviewProduct[], live: PublicCatalogProduct[]) {
  const byId = new Map(live.map(p => [p.id, p]));
  return preview.map(p => {
    const current = byId.get(p.id);
    if (!current) return { id: p.id, title: p.title, result: 'MISSING' as const };
    const livePrice = convertCurrency(current.price, current.currency, p.currency);
    const priceMatches = new Money(p.price).eq(livePrice);
    const stockMatches = (p.availability === 'instock') === current.inStock;
    return { id: p.id, title: p.title, previewPrice: p.price, livePrice, currency: p.currency, priceMatches, stockMatches,
      priceRange: current.priceRange ? { min: convertCurrency(current.priceRange.min, current.currency, p.currency), max: convertCurrency(current.priceRange.max, current.currency, p.currency) } : null,
      result: current.requiresVariantReview ? 'VARIANT_REVIEW' as const : priceMatches && stockMatches ? 'MATCH' as const : 'DIFFERENCE' as const };
  });
}
