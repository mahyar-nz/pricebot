import { describe, expect, it } from 'vitest';
import { compareCatalogSample, parsePublicCatalogProduct, parseTorobPreview, PublicCatalogReader } from '../src/connectors/catalog-audit.js';
import type { HttpRequest } from '../src/connectors/http.js';

const preview = (price = '8500000') => ({ products: [{ page_unique: 956, title: 'روغن دو حجم', current_price: price, availability: 'outofstock' }] });
const product = () => ({ id: 956, type: 'simple', has_options: false, is_in_stock: false, prices: { currency_code: 'IRT', currency_minor_unit: 0, price: '8500000', price_range: null as null | { min_amount: string; max_amount: string } } });
const resolver = async () => [{ address: '8.8.8.8', family: 4 }];
describe('read-only catalog audit', () => {
  it('compares a simple product without deriving competitor coverage', () => {
    expect(compareCatalogSample(parseTorobPreview(preview(), 'IRT'), [parsePublicCatalogProduct(product())])[0]?.result).toBe('MATCH');
  });
  it('quarantines the real two-volume parent even when a price matches', () => {
    const raw = product(); raw.type = 'variable'; raw.has_options = true;
    raw.prices.price = '2100000'; raw.prices.price_range = { min_amount: '2100000', max_amount: '8500000' };
    const row = compareCatalogSample(parseTorobPreview(preview(), 'IRT'), [parsePublicCatalogProduct(raw)])[0];
    expect(row).toMatchObject({ result: 'VARIANT_REVIEW', priceMatches: false, priceRange: { min: '2100000', max: '8500000' } });
    raw.prices.price = '8500000'; expect(compareCatalogSample(parseTorobPreview(preview(), 'IRT'), [parsePublicCatalogProduct(raw)])[0]?.result).toBe('VARIANT_REVIEW');
  });
  it('handles minor units and rial/toman explicitly', () => {
    const raw = product(); raw.prices.currency_code = 'IRR'; raw.prices.currency_minor_unit = 2; raw.prices.price = '8500000000';
    expect(compareCatalogSample(parseTorobPreview(preview(), 'IRT'), [parsePublicCatalogProduct(raw)])[0]?.result).toBe('MATCH');
  });
  it('does not report missing rows as a successful complete catalog', () => {
    expect(compareCatalogSample(parseTorobPreview(preview(), 'IRT'), [])[0]?.result).toBe('MISSING');
  });
  it('reports stock differences', () => {
    const raw = product(); raw.is_in_stock = true;
    expect(compareCatalogSample(parseTorobPreview(preview(), 'IRT'), [parsePublicCatalogProduct(raw)])[0]?.result).toBe('DIFFERENCE');
  });
  it('rejects duplicate preview identifiers', () => {
    const raw = preview(); raw.products.push(raw.products[0]!);
    expect(() => parseTorobPreview(raw, 'IRT')).toThrow('DUPLICATE');
  });
  it.each([-1, true, 'NaN', '1e5'])('rejects invalid snapshot amount %s', value => {
    const raw = preview(); (raw.products[0] as Record<string, unknown>).current_price = value;
    expect(() => parseTorobPreview(raw, 'IRT')).toThrow();
  });
  it('rejects unsupported currency and inverted range', () => {
    const raw = product(); raw.prices.currency_code = 'USD';
    expect(() => parsePublicCatalogProduct(raw)).toThrow('CURRENCY');
    raw.prices.currency_code = 'IRT'; raw.prices.price_range = { min_amount: '10', max_amount: '1' };
    expect(() => parsePublicCatalogProduct(raw)).toThrow('RANGE');
  });
  it('only sends a credential-free GET to the validated host', async () => {
    const calls: HttpRequest[] = [];
    const reader = new PublicCatalogReader('https://example.com/shop', async request => { calls.push(request); return { status: 200, headers: {}, body: JSON.stringify([product()]) }; }, resolver);
    expect((await reader.readSample([956])).length).toBe(1);
    expect(calls).toHaveLength(1); expect(calls[0]?.method).toBe('GET'); expect(calls[0]?.headers.Authorization).toBeUndefined(); expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.url.pathname).toBe('/shop/wp-json/wc/store/v1/products');
    expect('updatePrice' in reader).toBe(false);
  });
  it('rejects redirects without following them', async () => {
    const reader = new PublicCatalogReader('https://example.com', async () => ({ status: 302, headers: { location: 'http://127.0.0.1/' }, body: '' }), resolver);
    await expect(reader.readSample([956])).rejects.toThrow('HTTP_302');
  });
  it('rejects private destinations before any request', async () => {
    let called = false;
    const reader = new PublicCatalogReader('https://127.0.0.1', async () => { called = true; throw new Error('unexpected'); });
    await expect(reader.readSample([956])).rejects.toThrow('PRIVATE'); expect(called).toBe(false);
  });
  it('rejects extra or duplicate remote products', async () => {
    const reader = new PublicCatalogReader('https://example.com', async () => ({ status: 200, headers: {}, body: JSON.stringify([{ ...product(), id: 100 }]) }), resolver);
    await expect(reader.readSample([956])).rejects.toThrow('SAMPLE_IDS');
  });
});
